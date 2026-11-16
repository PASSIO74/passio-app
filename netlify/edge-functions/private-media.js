import {createPrivateMediaRelay} from '../lib/private-media-relay.js';
import {cibleMedias} from '../lib/cibles-medias.js';

export default (request, context) => createPrivateMediaRelay({target:cibleMedias(context)})(request);

// Toutes les méthodes arrivent au handler, afin que POST/OPTIONS refusent aussi
// sans tomber sur une autre route. Les en-têtes no-store sont dans chaque réponse.
export const config = {path:'/private-media/*',onError:'fail'};
