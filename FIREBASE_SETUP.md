# Configurar Firebase

La app funciona localmente sin Firebase. Para activar nube, login con Google y sincronizacion:

1. Entra a https://console.firebase.google.com y crea un proyecto.
2. Agrega una app Web en Project settings > General.
3. Copia el objeto `firebaseConfig`.
4. Pegalo en `firebase-config.js`.
5. En Authentication > Sign-in method, activa Google.
6. En Firestore Database, crea una base de datos.
7. Usa estas reglas para que cada usuario solo lea y escriba su propia informacion:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Para que Firebase Auth y la PWA funcionen bien, publica la carpeta en HTTPS, por ejemplo Firebase Hosting, Netlify, Vercel o GitHub Pages.

Durante desarrollo tambien puedes servirla desde localhost. No uses `file://` para probar login o service worker.
