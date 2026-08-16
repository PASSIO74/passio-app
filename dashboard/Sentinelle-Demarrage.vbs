' Lance le superviseur du centre de pilotage SANS fenêtre.
' Déposé dans le dossier Démarrage de Windows par Installer-Demarrage-Auto.cmd,
' il remet la sentinelle en route à chaque ouverture de session.
' Pour tout arrêter : Arreter-Pilotage.cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = dossier
' 0 = fenêtre masquée, False = ne pas attendre la fin
shell.Run "node """ & dossier & "\supervise.mjs""", 0, False
