package com.tiarkaerell.ecoride

import java.security.MessageDigest

/**
 * Pure half of the Super73 background sync: no Android types, so the JVM unit
 * tests cover it. Protocol from superduper (docs/ble_protocol.md,
 * BackgroundControlSync.kt) and client/src/lib/super73-ble.ts, which must agree.
 */
internal object BikeSyncProtocol {
    /** Byte 5 of a control frame; see SESSION_MARKER in super73-ble.ts. */
    const val SESSION_MARKER: Byte = 1
    const val CHALLENGE_LENGTH = 20

    /** Factory key the firmware creates on first boot (AUTH_DEFAULT_KEY in TS). */
    private val AUTH_KEY = ByteArray(20) { 0xff.toByte() }
    private val MAC = Regex("^([0-9A-F]{2}:){5}[0-9A-F]{2}$")

    /** SHA-1(challenge + key), written back to 0x2557. */
    fun authResponse(challenge: ByteArray): ByteArray {
        require(challenge.size == CHALLENGE_LENGTH) {
            "Authentication challenge has ${challenge.size} bytes, expected $CHALLENGE_LENGTH"
        }
        return MessageDigest.getInstance("SHA-1").digest(challenge + AUTH_KEY)
    }

    fun normalizeAddress(address: String): String {
        val normalized = address.uppercase()
        require(MAC.matches(normalized)) { "Invalid Bluetooth address: $address" }
        return normalized
    }

    /**
     * Validate the frame TypeScript built (v1 00D1, v2 00C1; 0xFF = leave that
     * field alone) and set the session marker, whatever byte 5 arrived with.
     */
    fun markedCommand(protocol: String, command: ByteArray): ByteArray {
        val opcode = when (protocol) {
            "v1" -> 0xd1
            "v2" -> 0xc1
            else -> throw IllegalArgumentException("Unsupported protocol: $protocol")
        }
        require(command.size == 10 && command[0] == 0.toByte() && command[1] == opcode.toByte()) {
            "Expected a 10-byte 00${"%02X".format(opcode)} control frame, got ${toHex(command)}"
        }
        return command.copyOf().also { it[5] = SESSION_MARKER }
    }

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    fun fromHex(hex: String): ByteArray {
        require(hex.length % 2 == 0 && hex.all { it in "0123456789abcdefABCDEF" }) { "Invalid hex: $hex" }
        return ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    }
}

/**
 * What to write when the bike appears; pushed by TypeScript (setPlan). Several
 * frames because the hardware only follows a real change of the register: the
 * app's connect sequence cycles light off→on and assist floor→target
 * (useSuper73 runConnectInitSequence), and a freshly booted bike is exactly the
 * case where it reports a state it does not hold.
 */
internal class BikeSyncPlan private constructor(
    val deviceId: String,
    val protocol: String,
    val commands: List<ByteArray>,
) {
    companion object {
        const val MAX_COMMANDS = 4

        fun of(deviceId: String, protocol: String, commands: List<ByteArray>): BikeSyncPlan {
            require(commands.size in 1..MAX_COMMANDS) { "Expected 1-$MAX_COMMANDS frames, got ${commands.size}" }
            return BikeSyncPlan(
                BikeSyncProtocol.normalizeAddress(deviceId),
                protocol,
                commands.map { BikeSyncProtocol.markedCommand(protocol, it) },
            )
        }
    }
}

/**
 * History inspection for one control frame, port of superduper's
 * BackgroundControlSync. Selecting a record on 0x1564 and reading 0x155f can
 * return a stale buffer, so every read goes through the FCFC barrier first and
 * the record id must match. The history record of the frame itself (00D1 /
 * 00C1, not the 0300 state record) echoes the last write and is zeroed at
 * power-on: byte 5 == 1 means this power cycle was already configured.
 * Frames are written in order; the receipt check expects the last one.
 */
internal class ControlSync(private val frames: List<ByteArray>) {
    private val marked = frames.last()
    sealed interface Action {
        class Select(val selector: ByteArray) : Action
        class Read(val delayMs: Long) : Action
        class Write(val command: ByteArray) : Action
        data class Complete(val applied: Boolean) : Action
        data class Failed(val detail: String) : Action
    }

    private enum class Stage { SELECT_BARRIER, READ_BARRIER, SELECT_CONTROL, READ_CONTROL, WRITE, FINISHED }

    private var stage = Stage.SELECT_BARRIER
    private var verifying = false
    private var reads = 0
    private var written = 0

    fun start(): Action {
        stage = Stage.SELECT_BARRIER
        return Action.Select(BARRIER.copyOf())
    }

    fun onWrite(): Action = when (stage) {
        Stage.SELECT_BARRIER -> read(Stage.READ_BARRIER)
        Stage.SELECT_CONTROL -> read(Stage.READ_CONTROL)
        Stage.WRITE -> if (++written < frames.size) {
            Action.Write(frames[written].copyOf())
        } else {
            verifying = true
            start()
        }
        else -> fail("Unexpected write completion")
    }

    fun onRead(value: ByteArray): Action {
        if (stage != Stage.READ_BARRIER && stage != Stage.READ_CONTROL) return fail("Unexpected read")
        val controlId = marked.copyOfRange(0, 2)
        val id = if (stage == Stage.READ_BARRIER) BARRIER else controlId
        val matches = value.size == 10 && value[0] == id[0] && value[1] == id[1]
        val receiptMismatch = stage == Stage.READ_CONTROL && verifying && !value.contentEquals(marked)
        if (!matches || receiptMismatch) {
            if (++reads < MAX_READS) return Action.Read(READ_DELAY_MS)
            return fail("Could not verify history record ${BikeSyncProtocol.toHex(id)}")
        }
        if (stage == Stage.READ_BARRIER) {
            stage = Stage.SELECT_CONTROL
            return Action.Select(controlId)
        }
        if (verifying || value[5] == BikeSyncProtocol.SESSION_MARKER) {
            stage = Stage.FINISHED
            return Action.Complete(applied = verifying)
        }
        stage = Stage.WRITE
        written = 0
        return Action.Write(frames[0].copyOf())
    }

    private fun read(next: Stage): Action {
        stage = next
        reads = 0
        return Action.Read(READ_DELAY_MS)
    }

    private fun fail(detail: String): Action {
        stage = Stage.FINISHED
        return Action.Failed(detail)
    }

    companion object {
        val BARRIER = byteArrayOf(0xfc.toByte(), 0xfc.toByte())
        const val MAX_READS = 20
        const val READ_DELAY_MS = 100L
    }
}
