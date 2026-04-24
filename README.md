# 🚀 TechFlow POS — Guide de Déploiement (Render + Supabase)

## Ce qui a changé

| Ancien (local) | Nouveau (production) |
|---|---|
| SQLite fichier | PostgreSQL Supabase |
| Sessions en mémoire RAM | Sessions persistées en base |
| Images sur disque local | Images dans Supabase Storage |
| Port fixe 5000 | Port dynamique via `process.env.PORT` |

---

## ÉTAPE 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com) → **New project**
2. Choisir un nom, mot de passe fort, région **EU (Paris)** recommandée

### Récupérer les clés

Aller dans **Settings → API** :
- `SUPABASE_URL` : l'URL du projet (ex: `https://abcdef.supabase.co`)
- `SUPABASE_SERVICE_KEY` : la clé **service_role** (⚠️ pas la clé anon !)

Aller dans **Settings → Database → Connection string → URI** :
- `DATABASE_URL` : copier l'URI complète, remplacer `[YOUR-PASSWORD]` par votre mot de passe

### Créer le bucket Storage

1. Aller dans **Storage → New bucket**
2. Nom : `uploads`
3. Cocher **Public bucket** ✅
4. Cliquer **Create bucket**

---

## ÉTAPE 2 — Pousser le code sur GitHub

```bash
cd TechFlow-Deploy
git init
git add .
git commit -m "TechFlow POS - Production ready"
git branch -M main
git remote add origin https://github.com/VOTRE_UTILISATEUR/techflow-pos.git
git push -u origin main
```

---

## ÉTAPE 3 — Déployer sur Render

1. Aller sur [render.com](https://render.com) → **New → Web Service**
2. Connecter votre repository GitHub
3. Configurer :
   - **Name** : `techflow-pos`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free

### Ajouter les variables d'environnement

Dans **Environment → Add Environment Variable** :

| Clé | Valeur |
|-----|--------|
| `DATABASE_URL` | `postgresql://postgres:...@db....supabase.co:5432/postgres` |
| `SESSION_SECRET` | Une chaîne aléatoire longue (ex: générer avec `openssl rand -base64 32`) |
| `SUPABASE_URL` | `https://[ref].supabase.co` |
| `SUPABASE_SERVICE_KEY` | La clé service_role |
| `SUPABASE_BUCKET` | `uploads` |
| `NODE_ENV` | `production` |

4. Cliquer **Create Web Service**

---

## ÉTAPE 4 — Vérifier le déploiement

Après quelques minutes, Render affiche les logs. Vous devez voir :

```
✅ PostgreSQL connecté
✅ Base de données initialisée
✅ Serveur démarré sur le port XXXX
🗄️  Database : Supabase PostgreSQL
🖼️  Storage  : Supabase Bucket (uploads)
```

Votre app sera accessible sur : `https://techflow-pos.onrender.com`

---

## Connexion par défaut

- **Utilisateur** : `admin`
- **Mot de passe** : `admin_26`

⚠️ Changer ce mot de passe immédiatement après la première connexion !

---

## Notes importantes

- **Free tier Render** : le serveur s'endort après 15 min d'inactivité, redémarre en ~30 secondes au prochain accès
- **Free tier Supabase** : 500MB de DB, 1GB de Storage — largement suffisant pour démarrer
- Les sessions sont persistées en base, donc les utilisateurs restent connectés même après un redémarrage
- Les images uploadées sont stockées dans Supabase Storage avec des URLs publiques permanentes
