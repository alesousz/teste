import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

let cache = null;

export async function preloadCharacterAssets() {
  if (cache) return cache;
  const [male, female] = await Promise.all([
    loadGLTF('assets/characters/Superhero_Male_FullBody.gltf'),
    loadGLTF('assets/characters/Superhero_Female_FullBody.gltf'),
  ]);
  cache = { male: male.scene, female: female.scene };
  return cache;
}

export function getCharacterTemplates() {
  return cache;
}
