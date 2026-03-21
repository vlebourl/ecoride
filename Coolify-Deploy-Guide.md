# Notice de déploiement Coolify — Homelab

_Rédigé par : Infra_
_Dernière mise à jour : 2026-03-21_

---

## 1. Prérequis

### Accès

| Ressource | URL / Adresse |
|-----------|---------------|
| Interface web Coolify | `https://coolify.tiarkaerell.com` |
| API Coolify (loopback, bypass WAF) | `http://localhost:8000` (depuis le serveur) |
| API Coolify (réseau local) | `http://192.168.1.48:8000` |
| SSH serveur Coolify | `ssh lyra@192.168.1.48` |

### Token API

Le token est généré dans **Coolify Settings → API Tokens**.

- Token actif : `lyra-deploy-phase4` — documenté dans `Projets/Homelab-Dashboard/Infra/Envs.md`
- Format : `<id>|<hash>` (ex: `15|WARq3n0...`)
- Passer en header HTTP : `Authorization: Bearer <token>`

> ⚠️ Ne jamais écrire la valeur du token dans un fichier versionné. Référencer uniquement le nom du token.

### UUID de l'application

Chaque application dans Coolify a un UUID unique visible dans l'URL de sa page de configuration.
Ex : `uwiqrojf18vy5t06m0womd12` → Homelab Dashboard

---

## 2. Déploiement via l'interface web

1. Se connecter à `https://coolify.tiarkaerell.com`
2. Dans le menu latéral → **Projects** → sélectionner le projet
3. Cliquer sur l'application cible
4. Onglet **Deployments** → bouton **Deploy**
5. Coolify clone le repo (branche configurée), build les images, redémarre les containers
6. Suivre les logs en temps réel dans l'onglet **Deployments** → déploiement en cours

> L'auto-deploy se déclenche normalement sur push vers la branche configurée (ex: `main`), si le webhook GitHub est actif. Si non, utiliser cette méthode manuelle ou l'API.

---

## 3. Déploiement via API

### Déclencher un deploy

```bash
# Depuis le serveur (loopback — bypass Cloudflare WAF)
ssh lyra@192.168.1.48 "curl -s -f -X GET \
  'http://localhost:8000/api/v1/deploy?uuid=<APP_UUID>' \
  -H 'Authorization: Bearer <TOKEN>'"
```

Réponse attendue :

```json
{
  "deployments": [{
    "message": "Application homelab-dashboard deployment queued.",
    "resource_uuid": "<APP_UUID>",
    "deployment_uuid": "<DEPLOY_UUID>"
  }]
}
```

> ⚠️ Toujours passer par SSH + loopback (`localhost:8000`) — l'API exposée via Coolify est derrière Cloudflare qui peut bloquer les appels directs depuis l'extérieur.

### Vérifier le statut d'un deploy (voir §5)

---

## 4. Déploiement via GitHub Actions (CI/CD)

### Runner self-hosted

Le runner GitHub Actions est hébergé sur `192.168.1.48`.
Label du runner : `homelab-runner`

### Workflow type

```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: homelab-runner
    steps:
      - name: Trigger Coolify deploy
        run: |
          RESPONSE=$(curl -s -f -X GET \
            "http://localhost:8000/api/v1/deploy?uuid=${{ secrets.COOLIFY_APP_UUID }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}")
          echo "$RESPONSE"
          DEPLOY_UUID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['deployments'][0]['deployment_uuid'])")
          echo "Deploy UUID: $DEPLOY_UUID"

      - name: Wait and verify
        run: |
          sleep 90
          STATUS=$(curl -s \
            "http://localhost:8000/api/v1/deployments/$DEPLOY_UUID" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('status'))")
          echo "Status: $STATUS"
          [ "$STATUS" = "finished" ] || exit 1
```

### Secrets GitHub requis

| Secret | Description |
|--------|-------------|
| `COOLIFY_TOKEN` | Token API Coolify (valeur complète `id\|hash`) |
| `COOLIFY_APP_UUID` | UUID de l'application Coolify |

> Les secrets sont configurés dans **GitHub → Settings → Secrets and variables → Actions**.
> Comme le runner est self-hosted sur le même réseau, il accède directement à `localhost:8000` sans passer par Cloudflare.

---

## 5. Vérification du statut d'un déploiement

### Via API

```bash
ssh lyra@192.168.1.48 "curl -s \
  'http://localhost:8000/api/v1/deployments/<DEPLOY_UUID>' \
  -H 'Authorization: Bearer <TOKEN>'" \
  | python3 -c "import sys,json; raw=sys.stdin.read(); d=json.loads(raw); print('Status:', d.get('status'))"
```

**Valeurs possibles :**

| Statut | Signification |
|--------|---------------|
| `queued` | En attente |
| `in_progress` | Build/déploiement en cours |
| `finished` | ✅ Succès |
| `failed` | ❌ Erreur — consulter les logs |

### Via l'endpoint HTTP du service

```bash
curl -s https://dashboard.tiarkaerell.com/ -o /dev/null -w "%{http_code}" --max-time 10
```

HTTP 200 = service up.

### Via l'interface Coolify

Onglet **Deployments** de l'application → liste des runs avec statut et logs complets.

---

## 6. Troubleshooting courant

### Auto-deploy ne se déclenche pas

**Cause probable :** webhook GitHub non configuré ou inactif.

**Vérification :**
1. GitHub → Settings du repo → Webhooks
2. Vérifier que le webhook Coolify est présent et que les derniers pings sont `200`
3. Si le webhook renvoie des erreurs 4xx/5xx → reconfigurer dans Coolify (onglet **Webhooks** de l'application)

**Solution alternative :** déclencher manuellement via l'API (§3) ou l'interface web (§2).

---

### Cloudflare WAF bloque l'appel API

**Symptôme :** `curl` vers `https://coolify.tiarkaerell.com/api/v1/deploy` retourne 403 ou 522.

**Cause :** Cloudflare filtre les requêtes API externes (User-Agent bot, IP non whitelistée, etc.).

**Solution :** toujours appeler l'API via SSH + loopback :

```bash
ssh lyra@192.168.1.48 "curl -s http://localhost:8000/api/v1/..."
```

Ou depuis le réseau local : `http://192.168.1.48:8000/api/v1/...`

> Règle : ne jamais appeler l'API Coolify depuis l'extérieur sans passer par le réseau local ou le loopback.

---

### Deploy `failed` — diagnostic

1. Aller dans l'interface Coolify → onglet **Deployments** → cliquer sur le run échoué
2. Lire les logs de build — les erreurs Docker/npm/pip apparaissent ici
3. Causes fréquentes :
   - **Image introuvable** : la base image (ex: `node:22-alpine`) n'est plus disponible → mettre à jour le Dockerfile
   - **npm ci échoue** : `package-lock.json` pas à jour → lancer `npm install` en local et committer
   - **Variable d'environnement manquante** : vérifier les variables configurées dans Coolify (onglet **Environment**)
   - **Port déjà utilisé** : un ancien container n'a pas été stoppé → `docker ps` sur le serveur pour vérifier

---

### Container redémarre en boucle (restart loop)

**Symptôme :** deploy `finished` mais container `restarting` dans `docker ps`.

**Diagnostic :**

```bash
ssh lyra@192.168.1.48 "docker logs <container_name> --tail 50"
```

**Causes fréquentes :**
- Variable d'environnement manquante ou mal formatée
- Erreur de healthcheck (endpoint `/health` pas encore disponible au démarrage → augmenter `start_period`)
- Crash applicatif au démarrage → lire le traceback dans les logs

---

### Token API expiré ou révoqué

**Symptôme :** `curl` retourne `401 Unauthorized`.

**Solution :**
1. Se connecter à Coolify → **Settings → API Tokens**
2. Révoquer l'ancien token
3. Créer un nouveau token
4. Mettre à jour la valeur dans :
   - `Projets/<nom>/Infra/Envs.md` (nom du token + date de validation)
   - Secrets GitHub (`COOLIFY_TOKEN`)
   - Tout script/workflow qui l'utilise

---

## Références

- Vault Infra : `Projets/Homelab-Dashboard/Infra/Envs.md`
- ADR Git Workflow : `Architecture/ADR/ADR-002-Git-Workflow.md`
- Preferences Tech : `Preferences-Tech.md`
