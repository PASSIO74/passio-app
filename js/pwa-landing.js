  // Sur iOS : afficher le bouton "Installer" dans la landing (le prompt auto ne marche pas sur Apple)
  if (_isIOS && !_isStandalone && !_pwaInstalled) {
    window.addEventListener('load', function() {
      var btn = document.getElementById('btn-install-app');
      if (btn) btn.style.display = '';
    });
  }
