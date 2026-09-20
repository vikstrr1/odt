import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyAuygI4Nm4SXMJSg6ytrSn7s3f2A66_O0c',
  authDomain: 'odt-project-12345.firebaseapp.com',
  projectId: 'odt-project-12345',
  storageBucket: 'odt-project-12345.firebasestorage.app',
  messagingSenderId: '810230994251',
  appId: '1:810230994251:web:6a5d8e3a80316d298ec4ce',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
