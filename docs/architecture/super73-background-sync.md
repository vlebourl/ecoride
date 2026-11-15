# Background Sync Super73 — analyse superduper et faisabilité ecoRide/Capacitor

Chemins relatifs au dépôt https://github.com/blopker/superduper (commit de novembre 2026). Kotlin = `android/app/src/main/kotlin/io/kbl/superduper/`.
Statut amont : « prêt pour validation sur appareil physique » (`docs/BACKGROUND_SYNC.md:3`). La matrice
Pixel/Samsung/Xiaomi, le stockage durable des résultats et l'onboarding hibernation restent à faire (`:205`).
Ce n'est donc pas un mécanisme éprouvé en production.

## 1. Mécanisme exact

**Association CDM** (`MainActivity.kt` ~130-240, `BackgroundCompanionManager.kt:66-78`)

- Filtre : `BluetoothLeDeviceFilter` avec un `ScanFilter.setDeviceAddress(<MAC exacte>)`, `setSingleDevice(true)`.
  Pas de filtre par nom ni par service : la MAC du vélo est stable d'un cycle d'allumage à l'autre (`BACKGROUND_SYNC.md:236`).
- `manager.associate(request, mainExecutor, callback)` sur API 33+, l'ancienne surcharge avec Handler sinon
  (`MainActivity.kt:167-174`). `onAssociationPending(IntentSender)` → `startIntentSenderForResult` (`:221-235`) : la
  **boîte de dialogue système** « Associer à <vélo> ? » s'affiche (une seule fois, quand l'utilisateur active la fonction).
- Garde-fous : un watchdog pour Android 12/12L, où la recherche peut se terminer sans callback (`BACKGROUND_SYNC.md:149`),
  et la vérification que la MAC associée est bien la MAC attendue (`MainActivity.kt:115-121, 205-210`).

**Observation de présence** (`BackgroundCompanionManager.kt:205-215, 272-292`)

- API ≥ 36 : `startObservingDevicePresence(ObservingDevicePresenceRequest.Builder().setAssociationId(id))`
  (`typedPresenceApi = 36`, `:39`).
- API 31-35 : `startObservingDevicePresence(String address)`, l'ancienne variante (`:211-212`).
- Ré-enregistrement après `BOOT_COMPLETED` et `MY_PACKAGE_REPLACED` (`BackgroundSyncRegistrationReceiver.kt:9-12`),
  au retour du Bluetooth sur `STATE_ON` (`SuperduperApplication.kt:12-22`, seulement tant que le process vit) et à
  chaque ouverture de l'app.
- **Déclencheur secondaire** : un scan BLE `startScan(filters, settings, PendingIntent)` sur les manufacturer data
  `0x020f` + les 8 octets du numéro de série du module, en `SCAN_MODE_LOW_POWER` et `FIRST_MATCH|MATCH_LOST`
  (`BackgroundCompanionManager.kt:217-253`). Il est reçu par `BackgroundScanReceiver.kt:10-34`. Les deux chemins
  peuvent réveiller un process mort.

**Service** (`BackgroundSyncCompanionService.kt`)

- API < 33 : `onDeviceAppeared(String)` (`:12-16`).
- API 33-35 : `onDeviceAppeared(AssociationInfo)` (`:27-36`).
- API ≥ 36 : `onDevicePresenceEvent(event)`. Seul `EVENT_BLE_APPEARED` lance la synchro, la disparition sert
  uniquement au diagnostic (`:46-66`).

**Manifest** (`AndroidManifest.xml`)

- `BLUETOOTH_SCAN` (`neverForLocation`), `BLUETOOTH_CONNECT`, `RECEIVE_BOOT_COMPLETED`,
  `REQUEST_COMPANION_RUN_IN_BACKGROUND`, `REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE` (`:5-11`), et la feature
  `companion_device_setup` avec `required=false` (`:13-15`).
- Service `exported=true`, `permission=BIND_COMPANION_DEVICE_SERVICE`, intent-filter
  `android.companion.CompanionDeviceService` (`:49-56`).
- **Aucun foreground service, aucun type `connectedDevice`.** Un FGS `connectedDevice` n'est que le repli documenté
  si le travail court échoue (`BACKGROUND_SYNC.md:249`).
- **minSdk 31** (`android/app/build.gradle*:28`), compileSdk 37.

## 2. Ce qui tourne en arrière-plan

- **Tout est en Kotlin natif. Le moteur Flutter ne démarre jamais** : « It does not start Flutter, WorkManager,
  notifications… » (`BACKGROUND_SYNC.md:242-247`). La transaction est une machine à états `NativeBikeTransaction`
  (`NativeBackgroundSync.kt:227-560`) qui enchaîne ces étapes :
  1. `connectGatt(autoConnect=false, TRANSPORT_LE)` (`:304-309`), puis la découverte des services (`:338`).
  2. Lecture du challenge sur 0x2554, puis `SHA-1(challenge + key)`. La longueur du challenge est vérifiée
     (`:397-408`).
  3. Écriture de la réponse, puis relecture de l'état d'auth, qui doit valoir `[1]` (`:442-448`, `:411-417`).
  4. Le protocole « historique » décrit plus bas, puis `disconnect()` et `close()` (`:529-550`).
- **Plan** : Dart l'écrit dans SQLite (Drift), dans les tables `background_sync_plans` et `background_sync_commands`,
  via `refreshBackgroundSyncPlan()` (`lib/src/persistence/app_database.dart:337-404`). Le plan est régénéré à chaque
  changement de vélo actif, de réglages « Set on connect » ou de consentement (`settings_repository.dart:59-79`).
  Il contient :
  - la MAC, le filtre de scan, toutes les UUID, le digest `"SHA-1"`, la clé et l'état attendu ;
  - **une seule trame de contrôle de 10 octets** (`00 D1` pour V1, `00 C1` pour V2). Un champ désactivé vaut `0xFF`,
    que le firmware ignore (`app_database.dart:420-440`, `BACKGROUND_SYNC.md:193-203`).
- **Lecture native** : `BackgroundSyncPlanStore.load()` ouvre la base en lecture seule, vérifie `user_version >= 5`
  et `plan_version == 2`, contrôle que la MAC correspond et impose exactement une commande
  (`BackgroundSyncPlanStore.kt:67-177`). Le natif ne modifie jamais la base. Les résultats vont dans les
  SharedPreferences `background_sync` (`NativeBackgroundSync.kt:194-208`).
- **Marqueur de session (octet 5)** : `BackgroundControlSync.kt`
  - Toute écriture de contrôle de l'app, en premier plan comme en arrière-plan, met l'octet 5 à 1 (`:17-27`,
    `lib/src/ble/bike_protocol.dart:11-13`).
  - Au démarrage, le firmware réinitialise l'enregistrement d'historique de contrôle à zéro
    (`BACKGROUND_SESSION_EVIDENCE.md:26-35`). C'est vérifié sur un V1 physique, pas sur un V2 (`:171-197`).
  - Séquence :
    1. Sélection d'une barrière `FC FC` sur 0x1564, puis lecture de 0x155f. Cela évite de lire un buffer périmé.
    2. Sélection de l'ID de contrôle, puis lecture.
    3. Si l'octet 5 vaut 1 → `skippedAlreadySynchronized`. Sinon → écriture de la trame marquée, puis
       barrière + relecture complète → `confirmed` (`:32-78`).
  - Au plus 20 lectures espacées de 100 ms par étape (`:7, 63-66`). Un enregistrement absent ou illisible fait
    échouer la transaction : il n'est jamais traité comme « non marqué ».
  - Effet : si le cycliste change l'assistance aux boutons après la synchro, une reconnexion n'écrase pas ce
    changement.
- **Propriétaire unique de la connexion** :
  - La transaction est annulée dès que l'Activity passe au premier plan (`MainActivity.kt:89-93`).
  - Elle est ignorée si l'app est au premier plan, en pause manuelle ou déjà occupée
    (`NativeBackgroundSync.kt:85-98`).

## 3. Contraintes et pièges documentés

- **Force Stop** : le chemin reste coupé jusqu'à la prochaine ouverture de l'app. Pour tester, utiliser
  `am kill`, jamais `force-stop` (`BACKGROUND_SYNC.md:224, 251-261`).
- **Hibernation** (app inutilisée plusieurs mois) : elle réinitialise les permissions. Il faut proposer de désactiver
  « Suspendre l'activité si inutilisée » (`:253-259`).
- **Doze, écran éteint, modes batterie restreints, OEM** : à tester, pas prouvé (`:370-381`). Le scan par
  PendingIntent sert de filet si un callback CDM manque.
- **FGS Android 14+** : évité exprès. Le travail tient dans la fenêtre du bind CDM, avec un timeout dur de **45 s**
  (`NativeBackgroundSync.kt:557`). `REQUEST_COMPANION_RUN_IN_BACKGROUND` donne l'exemption des restrictions
  d'arrière-plan. Si un FGS devient nécessaire : type `connectedDevice` et notification visible.
- **Bonding** : aucun. Pas de `createBond`, le GATT est ouvert directement. L'association CDM n'est pas un
  appairage (`BACKGROUND_SYNC.md:234, 278`).
- **Retries** : pas de retry dans une même apparition, pas de cooldown. Chaque nouvelle apparition peut relancer une
  tentative, le marqueur assure l'idempotence (`:174-177`). Si le Bluetooth est coupé, la synchro reste `pending` et
  reprend à `STATE_ON` (`NativeBackgroundSync.kt:210-216, 51-68`).
- **Autres clients BLE** (l'app officielle, un autre téléphone) : ils peuvent écraser le marqueur. Il y a alors
  réapplication (`BACKGROUND_SESSION_EVIDENCE.md:83-85`).
- **Accusé de réception** : la relecture de l'historique prouve que le firmware a reçu la commande, pas que le
  contrôleur moteur l'a appliquée (`:69-76`).

## 4. Faisabilité pour ecoRide (Capacitor 8)

**Constat** : notre logique BLE vit en TypeScript dans la WebView (`client/src/lib/super73-ble.ts`), via
`@capacitor-community/bluetooth-le`. App tuée = pas de JS. Le plugin communautaire ne gère ni le CDM ni la
présence.

### (a) Port natif minimal : plugin Capacitor custom + CompanionDeviceService (recommandé)

Code Kotlin superduper dédié au background : environ 1 290 LOC dans les 8 fichiers `Background*` /
`NativeBackgroundSync` / `Application`, plus environ 150 LOC d'association dans `MainActivity`.
Version minimale pour ecoRide, en LOC Kotlin :

| Brique                                                                                                 | LOC      | Remarque                                                                                 |
| ------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `CompanionDeviceService`                                                                               | ~50      | Copie quasi directe de `BackgroundSyncCompanionService.kt`                               |
| Association + observation (dans `@CapacitorPlugin`, `startIntentSenderForResult` via `ActivityResult`) | ~180     | `associate`, `startObserving`, `disassociate`, watchdog Android 12                       |
| Transaction GATT (connexion, auth SHA-1, historique)                                                   | ~330     | Reprise de `NativeBikeTransaction` et `BackgroundControlSync`                            |
| Plan : JSON dans SharedPreferences, écrit par TS via `plugin.setPlan()`                                | ~40      | Remplace le store SQLite, inutile chez nous                                              |
| Récepteur boot/update + annulation au premier plan (`handleOnStart`)                                   | ~30      |                                                                                          |
| **Total**                                                                                              | **~650** | Sans le scan PendingIntent (~80, à ajouter si des callbacks CDM manquent sur le terrain) |

Points spécifiques ecoRide :

- **minSdk 24** (`client/android/variables.gradle:2`) contre 31 requis. Il faut un garde à l'exécution
  `SDK_INT >= 31` et masquer la fonction en dessous.
- **Nos écritures de premier plan mettent l'octet 5 à 0** (`super73-ble.ts:155-175`). Il faut le passer à 1, sinon
  un réveil après une session pilotée depuis l'app écrasera les réglages choisis. C'est un changement TS d'une ligne
  par protocole.
- La logique d'auth et de trame existe déjà en TS (`super73-ble.ts:401-426`). Il faut la dupliquer en Kotlin avec des
  vecteurs de test partagés, sur le modèle des « golden fixtures » côté Dart chez superduper
  (`BACKGROUND_SYNC.md:316`).
- Propriétaire unique : le service natif ne doit pas se connecter pendant que la WebView tient le GATT, et il faut
  annuler la transaction au `onStart` de l'Activity.

**Estimation (a)** :

- 14-20 h de dev, dont le plugin, le service, la machine à états, le bridge TS, l'UI d'opt-in et les tests unitaires
  Kotlin de la machine à états et de l'encodage ;
- 8-12 h de validation sur vélo et téléphones réels : process tué, écran éteint, reboot, Doze ;
- **environ 25-30 h au total**. Ajouter 4-6 h si le scan PendingIntent s'avère nécessaire.

### (b) Réveiller la WebView : non fiable, à écarter

- Le Bridge Capacitor est lié à une `Activity`. Il n'existe pas de mode headless supporté, et une WebView créée dans
  un Service n'est ni supportée ni fiable : timers JS throttlés, aucun cycle de vie Capacitor.
- Lancer l'Activity depuis le service est techniquement autorisé, car l'association CDM est une exemption au blocage
  des lancements d'Activity en arrière-plan. Mais l'UI s'affiche quand on allume le vélo, en contradiction avec
  l'objectif « l'UI ne doit jamais apparaître » (`BACKGROUND_SYNC.md:385`).
- Le démarrage à froid (process, WebView, bundle JS, init du plugin BLE) consomme une grosse part du budget, sans
  garantie de bind. Écran verrouillé ou Doze rendent le résultat aléatoire.
- Même superduper, avec Flutter, a refusé de démarrer son moteur en arrière-plan et a choisi le natif.

## Recommandation

Option (a), gardée derrière un opt-in « Synchro au démarrage » réservé à Android 12+ :

1. Marquer l'octet 5 dans `buildWriteCommand`. Ce changement a de la valeur seul et peut être livré en premier.
2. Plugin Kotlin minimal : association, présence, transaction bornée à 45 s, plan JSON poussé par TS.
3. Valider sur appareil avant d'ajouter le scan PendingIntent ou un FGS.

Ne rien promettre après un Force Stop ou une hibernation. Le comportement du marqueur sur V2 n'est pas vérifié sur
matériel.
