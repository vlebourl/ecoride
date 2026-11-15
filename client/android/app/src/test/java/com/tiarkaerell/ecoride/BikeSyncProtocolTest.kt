package com.tiarkaerell.ecoride

import com.tiarkaerell.ecoride.BikeSyncProtocol.fromHex
import com.tiarkaerell.ecoride.BikeSyncProtocol.toHex
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class BikeSyncProtocolTest {
    // Frame TypeScript pushes for EU eco, assist 2, light untouched (0xFF).
    private val v1Plan = fromHex("00d1ff0204ff00000000")

    @Test
    fun authResponseIsSha1OfChallengeAndFactoryKey() {
        // Golden vector: sha1(bytes 0..19 + 20 x 0xFF), computed independently.
        val challenge = ByteArray(20) { it.toByte() }
        assertEquals("1344d49a08c20a392a05f60e0c269d94d38648ec", toHex(BikeSyncProtocol.authResponse(challenge)))
    }

    @Test
    fun authResponseRejectsAWrongChallengeLength() {
        assertThrows(IllegalArgumentException::class.java) { BikeSyncProtocol.authResponse(ByteArray(16)) }
    }

    @Test
    fun markedCommandForcesTheSessionByte() {
        assertEquals("00d1ff02040100000000", toHex(BikeSyncProtocol.markedCommand("v1", v1Plan)))
        assertEquals(
            "00c101030201ffffffff",
            toHex(BikeSyncProtocol.markedCommand("v2", fromHex("00c1010302ffffffffff"))),
        )
    }

    @Test
    fun markedCommandRejectsTheOtherProtocolsFrame() {
        // A v1 frame sent to a v2 bike is at best ignored: refuse it up front.
        assertThrows(IllegalArgumentException::class.java) { BikeSyncProtocol.markedCommand("v2", v1Plan) }
        assertThrows(IllegalArgumentException::class.java) { BikeSyncProtocol.markedCommand("unknown", v1Plan) }
        assertThrows(IllegalArgumentException::class.java) {
            BikeSyncProtocol.markedCommand("v1", fromHex("00d1ff0204ff0000"))
        }
    }

    @Test
    fun planNormalizesTheAddress() {
        assertEquals("FD:10:4A:A9:45:46", BikeSyncPlan.of("fd:10:4a:a9:45:46", "v1", listOf(v1Plan)).deviceId)
        assertThrows(IllegalArgumentException::class.java) { BikeSyncPlan.of("FD104AA94546", "v1", listOf(v1Plan)) }
    }

    @Test
    fun planMarksEveryFrameAndCapsTheSequence() {
        val plan = BikeSyncPlan.of("FD:10:4A:A9:45:46", "v1", listOf(fromHex("00d10002040000000000"), v1Plan))
        assertEquals(listOf("00d10002040100000000", "00d1ff02040100000000"), plan.commands.map(::toHex))
        assertThrows(IllegalArgumentException::class.java) { BikeSyncPlan.of("FD:10:4A:A9:45:46", "v1", emptyList()) }
        assertThrows(IllegalArgumentException::class.java) {
            BikeSyncPlan.of("FD:10:4A:A9:45:46", "v1", List(5) { v1Plan })
        }
    }

    @Test
    fun hexRoundTrips() {
        assertEquals("00d1ff0204ff00000000", toHex(fromHex("00D1FF0204FF00000000")))
        assertThrows(IllegalArgumentException::class.java) { fromHex("0g") }
    }
}

class ControlSyncTest {
    private val marked = BikeSyncProtocol.markedCommand("v1", fromHex("00d1ff0204ff00000000"))
    private val barrier = fromHex("fcfc2211220000000000")

    private fun selector(action: ControlSync.Action) = toHex((action as ControlSync.Action.Select).selector)

    /** Barrier, then the control record (00D1 history, not the 0300 state record). */
    private fun readControl(sync: ControlSync, record: ByteArray): ControlSync.Action {
        assertEquals("fcfc", selector(sync.start()))
        assertTrue(sync.onWrite() is ControlSync.Action.Read)
        assertEquals("00d1", selector(sync.onRead(barrier)))
        assertTrue(sync.onWrite() is ControlSync.Action.Read)
        return sync.onRead(record)
    }

    @Test
    fun skipsTheWriteWhenThisPowerCycleIsAlreadyMarked() {
        // The rider changed assist after the app's write: must not be overwritten.
        val action = readControl(ControlSync(listOf(marked)), fromHex("00d10103040100000000"))
        assertEquals(ControlSync.Action.Complete(applied = false), action)
    }

    @Test
    fun writesTheMarkedFrameAfterAFreshBootThenVerifiesIt() {
        val sync = ControlSync(listOf(marked))
        val write = readControl(sync, fromHex("00d10000000000000000"))
        assertEquals(toHex(marked), toHex((write as ControlSync.Action.Write).command))
        assertEquals("fcfc", selector(sync.onWrite()))
        assertTrue(sync.onWrite() is ControlSync.Action.Read)
        assertEquals("00d1", selector(sync.onRead(barrier)))
        assertTrue(sync.onWrite() is ControlSync.Action.Read)
        assertEquals(ControlSync.Action.Complete(applied = true), sync.onRead(marked))
    }

    @Test
    fun writesEveryFrameInOrderThenVerifiesTheLastOne() {
        // Light off→on cycle: the hardware only follows a real register change.
        val dark = BikeSyncProtocol.markedCommand("v1", fromHex("00d10004040000000000"))
        val lit = BikeSyncProtocol.markedCommand("v1", fromHex("00d10104040000000000"))
        val sync = ControlSync(listOf(dark, lit))
        val first = readControl(sync, fromHex("00d10000000000000000"))
        assertEquals(toHex(dark), toHex((first as ControlSync.Action.Write).command))
        assertEquals(toHex(lit), toHex((sync.onWrite() as ControlSync.Action.Write).command))
        assertEquals("fcfc", selector(sync.onWrite()))
        sync.onWrite()
        sync.onRead(barrier)
        sync.onWrite()
        assertTrue(sync.onRead(dark) is ControlSync.Action.Read)
        assertEquals(ControlSync.Action.Complete(applied = true), sync.onRead(lit))
    }

    @Test
    fun retriesAStaleBufferThenFailsRatherThanAssumingUnmarked() {
        val sync = ControlSync(listOf(marked))
        sync.start()
        sync.onWrite()
        // 0x155f still holds the previous record (0300) instead of the barrier.
        val stale = fromHex("0300045a010400000000")
        repeat(ControlSync.MAX_READS - 1) { assertTrue(sync.onRead(stale) is ControlSync.Action.Read) }
        assertTrue(sync.onRead(stale) is ControlSync.Action.Failed)
    }

    @Test
    fun aMismatchedReceiptIsRetriedNotConfirmed() {
        val sync = ControlSync(listOf(marked))
        readControl(sync, fromHex("00d10000000000000000"))
        sync.onWrite()
        sync.onWrite()
        sync.onRead(barrier)
        sync.onWrite()
        assertTrue(sync.onRead(fromHex("00d10000000000000000")) is ControlSync.Action.Read)
    }
}
