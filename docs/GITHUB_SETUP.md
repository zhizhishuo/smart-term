# GitHub Setup

## 1) Initialize repository

```bash
git init
git add .
git commit -m "chore: initialize Smart-Term Electron repository baseline"
```

## 2) Create remote repository

Create an empty repository on GitHub, e.g.:

- `smart-term-electron`

## 3) Connect and push

```bash
git remote add origin https://github.com/<your-org-or-user>/smart-term-electron.git
git branch -M main
git push -u origin main
```

## 4) Repository settings

- Protect `main` branch
- Require PR review before merge
- Enable Actions
- Enable Issues and Discussions as needed

## 5) Replace placeholders

Update `package.json`:

- `repository.url`
- `bugs.url`
- `homepage`
