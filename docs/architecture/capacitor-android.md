# App Android (Capacitor) — Bluetooth Super73 natif

Statut : **spike** (branche `feat/capacitor-android`). Rien n'est publié.

## Pourquoi

Depuis le 14/11/2026, sur un Pixel 9 Pro (Android 17, Chrome 157), le vélo se
connecte en Web Bluetooth, le lien est chiffré, mais **aucune lecture GATT
n'aboutit**, même sur Device Information (0x180a, lisible sans auth). Sur le même
téléphone, les apps natives (app officielle, superduper) fonctionnent.

Le 15/11, le même vélo a été validé depuis Chrome macOS. Le **protocole web est
donc correct**, seul le transport Chrome Android est en cause :

- Device Information : firmware `221122` (protocole v1), hardware `v3.2.0`,
  fabricant `COMODULE` ;
- l'état d'auth 0x2558 vaut déjà `01` avant le handshake (bug v1 documenté),
  puis `SHA1(défi + 20×0xFF)` est accepté ;
- l'historique renvoie `0300` → `0300045a010400000000` (eco/EU, assistance 4,
  lumière ON), `0203` → `02030000000000002e00` (46 km) et
  `0202` → `0202003b00005dce0000` (odomètre), tandis que `00d0`/`00d9` sont
  absents (registre inchangé).

Ces trames servent de fixtures dans `client/src/lib/__tests__/super73-protocol.test.ts`.

## Architecture

```
useSuper73.ts (inchangé)
   │
super73-ble.ts  ← protocole unique : auth, détection v1/v2, trames, historique
   │  API Web Bluetooth (BluetoothDevice / GATT server / characteristic)
   ├── navigator.bluetooth                (PWA)
   └── ble-native.ts  → @capacitor-community/bluetooth-le   (app Android)
                        + Super73BondPlugin.java (removeBond)
```

`ble-native.ts` implémente uniquement le sous-ensemble Web Bluetooth que le
protocole utilise. Le protocole n'est donc **pas dupliqué**. Le plugin est chargé
à la demande, seulement quand `window.Capacitor.isNativePlatform()` est vrai :
dans la PWA, ce chunk ne se charge jamais.

L'app charge le site déployé (`server.url` dans `client/capacitor.config.ts`).
Elle partage ainsi son origine (cookies de session, API, callback OAuth) et
récupère chaque déploiement web sans rebuild. Une modification **native**
(Java/Kotlin, manifeste, plugins) exige un nouvel APK.

### Connexion (comme superduper)

- **Exigence n°1 : ne JAMAIS demander de MTU.** Cause probable de l'échec
  Chrome Android (logcat, 15/11 16:15) :
  - à la connexion, le vélo lance lui-même un Exchange MTU (→ 247) ;
  - Chrome envoie ensuite `requestMtu(517)`, codé en dur dans
    `ChromeBluetoothDevice.java` ;
  - Android logge `bta_gattc_enqueue: Already has a pending command … Queuing
for later`, puis plus aucune requête ATT n'aboutit (même Device Information).

  Le firmware ne répond vraisemblablement pas à ce 2ᵉ échange, ce qui bloque le
  bearer ATT. La PWA ne peut rien y faire.

  Le plugin `bluetooth-le` demandait 512 à chaque connexion. Le patch
  (`patches/`, via `bun patch`) supprime l'appel **et** la fonction
  `requestMtu`, comme superduper (`mtu: null`). Android répond seul à l'échange
  lancé par le vélo.

  Garde-fou : `client/src/lib/__tests__/native-no-mtu-request.test.ts` scanne
  le Kotlin/Java réellement compilé (plugin, Capacitor, `android/app`) et échoue
  sur tout appel `requestMtu(`. Le patch est indexé sur la version du plugin :
  une montée de version qui le perdrait en silence casse ce test, pas le vélo.
  Le test a été validé par mutation (un appel réinjecté le fait échouer).

- Découverte des services, puis auth, puis lectures.
- Type d'écriture : acquittée sauf si la caractéristique n'offre que _write
  without response_.

### Version du protocole (v1 / v2)

Superduper `docs/ble_protocol.md` et `lib/src/ble/bike_protocol.dart` :

|                   | v1 (`221122`)         | v2 (`250426`)                            |
| ----------------- | --------------------- | ---------------------------------------- |
| Nom annoncé       | `SUPER73`             | `S73 FTEX`                               |
| Écriture contrôle | `00D1`                | `00C1`                                   |
| État              | enregistrement `0300` | `00D0` (assist, lumière) + `00D9` (mode) |

À chaque connexion, le DIS `0x2a26` est lu **avant** le handshake (lecture
ouverte, journalisée `dis_firmware`). Identification : le nom exact et le
firmware doivent concorder quand les deux sont connus (sinon : inconnu), un seul
suffit, et à défaut on sonde `00D9` → v2 puis `0300` → v1. Un vélo non identifié **ne reçoit
aucune commande**. Toute lecture d'historique vérifie l'ID de l'enregistrement
renvoyé, car 0x155f garde son ancienne valeur si l'ID est absent : c'est un
correctif, l'ancien code décodait le contenu sans vérifier.

Le client web actuel était **cohérent v1** et non mixte : `[0,209,…]` = `00D1`
est l'écriture v1. En v2, `00D1` existe aussi, mais comme enregistrement de
_télémétrie_ (vitesse, autonomie), ce qui explique la confusion.

L'état d'auth à `01` avant le handshake ne doit **jamais** servir à sauter le
handshake : c'est le bug v1 de déconnexion.

### Bond (appairage)

Les services 0x1554/0x2554 exigent un lien chiffré (Security Mode 1 Level 2).
Une connexion sans bond ne peut donc pas piloter le vélo : seul le DIS est
lisible. `NativeGattServer.connect()` procède ainsi :

1. connexion, découverte ;
2. si Android n'a pas de bond : `createBond` (Just Works) ;
3. sonde chiffrée : lecture de 0x1564, sans effet de bord ;
4. si la sonde échoue alors qu'un bond existe, le bond est périmé : `removeBond`
   (plugin local, API Android cachée), reconnexion, nouvel appairage, nouvelle
   sonde ;
5. second échec : abandon, avec le message « oubliez le vélo dans les réglages
   Bluetooth ».

Observation sur macOS : la 1ʳᵉ connexion après « oublier l'appareil » marche,
les suivantes échouent (« Unsupported device »). **Hypothèse non prouvée** : le
vélo ne conserve qu'un bond, et un appairage ailleurs évince le précédent. Le
chemin 4 couvre ce cas côté Android.

Les déconnexions provoquées par cette récupération ne sont pas remontées à
l'app comme `gattserverdisconnected`.

### Connexion Google

Google refuse son OAuth web dans une WebView (`disallowed_useragent`). L'app
utilise donc le sélecteur de compte natif : Credential Manager, via
`@capgo/capacitor-social-login` (`client/src/lib/native-google.ts`). L'ID token
obtenu part dans `signIn.social({ provider: "google", idToken: { token, nonce } })`.

Better Auth 1.7.14 vérifie l'émetteur, la signature, l'audience (= l'ID client
**web** déjà configuré) et le nonce, puis pose le même cookie de session que le
flux web. **Aucun changement serveur**, et c'est le même compte que dans la PWA.

Prérequis Google Cloud (projet `1077014709095`) : un client OAuth de type
**Android** pour le package `com.tiarkaerell.ecoride` et la SHA-1 de la clé de
signature. Le client debug de condor (SHA-1 `90:2E:…:C0:97`) est créé. La clé
release demandera une 2ᵉ empreinte.

Seul Google est compilé : `plugins.SocialLogin.providers` dans
`capacitor.config.ts` exclut les SDK Facebook, Apple et Twitter. Leur absence
dans le dex est vérifiée.

## Plan v1 installable

| Étape                                                                                                                                                                      | Estimation     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Test terrain de l'APK debug (connexion, auth, lecture, écriture, bond périmé)                                                                                              | 1–2 h          |
| GPS en arrière-plan : foreground service `location` + `ACCESS_BACKGROUND_LOCATION`, par ex. `@capacitor-community/background-geolocation` branché sur le tracking existant | 6–8 h          |
| Signature release (keystore hors dépôt) + workflow CI qui publie l'APK en release GitHub                                                                                   | 2–3 h          |
| Hors ligne : vérifier le démarrage à froid sans réseau (service worker dans la WebView avec `server.url`)                                                                  | 1–2 h          |
| **Total v1 (sideload)**                                                                                                                                                    | **≈ 1,5 jour** |

**Distribution recommandée : APK signé en sideload** (release GitHub). Play
exige une revue, une justification de la localisation en arrière-plan et une
montée annuelle de `targetSdk`. À considérer seulement si d'autres utilisateurs
arrivent.

**Mises à jour** : le code web suit les déploiements automatiquement
(`server.url`). Pas de live update de bundle (Capgo, Appflow) : inutile tant que
le site est chargé en ligne. Il faudra le reconsidérer si le hors-ligne au
démarrage pose problème.

**Background Sync** (réglages appliqués quand le vélo s'allume, app fermée) :
voir [`super73-background-sync.md`](super73-background-sync.md). C'est faisable,
mais en Kotlin natif (CDM + `CompanionDeviceService`), Android 12+, ≈ 25–30 h.
Prérequis : marquer l'octet 5 des écritures à `1`.

## Release signée (CI)

`.github/workflows/android-release.yml`, lancé à la main
(`gh workflow run android-release.yml`) quand le code **natif** change. Le code
web, lui, arrive par le déploiement. Le workflow :

1. construit l'APK release sur un runner GitHub ;
2. le signe avec la keystore stockée dans les secrets `ANDROID_KEYSTORE_*` ;
3. vérifie qu'il n'est pas signé debug ;
4. le publie en release `android-v<version>`.

La version vient du `package.json` racine (`2.56.0` → `versionCode 25600`).

**Keystore** : `CN=ecoRide`, RSA 4096, valide jusqu'en 2054, SHA-1
`92:97:CF:5D:3D:63:4D:34:44:BF:76:C6:8A:F3:38:46:1F:FB:21:D1`. Un secret GitHub
ne se relit pas : l'original et son mot de passe sont sur condor
(`~/ecoride-release-keystore/`, `700`/`600`), à copier dans le gestionnaire de
mots de passe. **Perdre cette clé = plus aucune mise à jour possible de l'app
installée.**

Cette SHA-1 doit aussi figurer dans un client OAuth Android (projet
`1077014709095`, package `com.tiarkaerell.ecoride`), sans quoi la connexion
Google échoue dans l'APK release. Passer d'un APK debug à un APK release
demande de désinstaller d'abord : les signatures diffèrent.

## Limites connues du spike

- v2 implémenté d'après la doc, **jamais testé sur un vélo v2**. Région non
  portée par v2 (rapportée `us`). Autonomie et batterie v2 non décodées.
- Relire deux fois le même enregistrement peut renvoyer l'ancienne copie
  (superduper intercale `FCFC` comme barrière) : non fait.
- `minSdk` 24 : le Background Sync exigera un garde à l'exécution (API 31+).
- `capacitor.settings.gradle` référence le store Bun (`node_modules/.bun/…`) : il
  est régénéré par `bunx cap sync android`.

## Build et test manuel

```bash
# 1. Web + synchronisation Capacitor (macOS)
cd client && bunx vite build && bunx cap sync android
# 2. APK debug (JDK 21 + SDK Android ; condor : JBR d'Android Studio)
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew assembleDebug
# 3. Installation (téléphone branché)
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`server.url` pointe sur la prod. Le transport natif n'y sera actif qu'**après
déploiement** de ce code web. Avant, il faut passer par `CAP_SERVER_URL` (voir
la PR).

Scénario :

0. **Premier test : connexion + lecture `0x2a26` sur le Pixel.** Attendre
   `dis_firmware 221122` dans les logs. C'est le test décisif : il échouait
   en Chrome Android, avant toute auth. En parallèle, vérifier dans
   `adb logcat` qu'aucun `requestMtu`/`configureMTU` client ne part et
   qu'aucun `Already has a pending command` n'apparaît.
1. Autoriser « Appareils à proximité » et « Localisation ».
2. Véhicule → Connecter : scan, puis connexion automatique au `SUPER73`.
3. Logs (`chrome://inspect` sur condor, ou `adb logcat | grep -i Bluetooth`) :
   attendre `auth_ok` puis `protocol v1`.
4. Vérifier que l'état (mode, assistance, lumière) correspond au guidon.
5. Changer le mode depuis l'app, puis vérifier sur le guidon.
6. Bond périmé : appairer le vélo à un autre appareil, revenir, reconnecter.
   Attendre `bond_stale` puis `bond_recovered`.
