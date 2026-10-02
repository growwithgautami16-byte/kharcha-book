# Kharcha Book

Shared household expense book for Akash and Gautami. It's an iPhone home-screen web app that uses Firebase for login and live sync, and it's hosted on GitHub Pages.

- `index.html`, `app.js`: the app
- `config.js`: Firebase config, login emails, monthly budgets (the only file to edit)
- `firestore.rules`: the access rules published in Firebase (only the two emails can read or write)
- `SETUP.txt`: step-by-step setup

The Firebase web config is safe to keep in a public repo. Access is enforced by the Firestore rules.
