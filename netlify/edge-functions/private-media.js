import {createPrivateMediaRelay} from '../lib/private-media-relay.js';
import {cibleMedias} from '../lib/cibles-medias.js';

export default (request, context) => createPrivateMediaRelay({target:cibleMedias(context)})(request);

// Toutes les méthodes arrivent au handler : seules POST vide et HEAD marquées
// sont admises. Chaque réponse du handler porte les en-têtes no-store.
export const config = {path:'/private-media/*',onError:'fail'};
