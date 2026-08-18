// SENTINEL AUTOPILOT BOOTSTRAP — branche l'exécuteur sans modifier le moteur.
//
// Sentinel garde sa responsabilité : détecter/diagnostiquer/réparer dans une
// branche isolée et vérifier le patch. Ce bootstrap enveloppe uniquement le
// réparateur : si (et seulement si) une réparation est déjà vérifiée, il demande
// à l'Autopilot de décider puis éventuellement d'exécuter la promotion locale
// transaction