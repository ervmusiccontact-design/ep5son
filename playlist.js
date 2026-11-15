/* =====================================================================
   PLAYLIST : le seul fichier à modifier.

   Chaque morceau est décrit avec les NOMS EXACTS de ses fichiers
   (extension comprise, majuscules et accents compris), tels qu’ils
   sont dans le dossier "musique".

   L’ORDRE DE LA LISTE EST L’ORDRE DE LECTURE.

   Champs d’un morceau :
     titre    : nom affiché
     artiste  : facultatif (sinon l’artiste par défaut)
     mp3      : nom du fichier audio
     srt      : nom du fichier de paroles (facultatif). Formats acceptés :
                .srt, .vtt, .lrc, ou même .txt s’il contient du SRT.
   ===================================================================== */
window.PLAYLIST = {
  dossier: 'musique',          // dossier des fichiers (à côté de index.html)
  pochette: 'cover.png',       // nom de la pochette, dans ce dossier
  album: 'Mon album',          // affiché après l’artiste
  artiste: 'ERV',      // artiste par défaut

  morceaux: [
    {
      titre: 'JTM',
      mp3: 'jtm',
      srt: 'jtm.srt'
    },
    {
      titre: 'Bella',
      mp3: 'bella.mp3',
      srt: 'bella.srt'
    },
    {
      titre: 'Troisième titre',
      mp3: '03 - Troisième titre.mp3',
      srt: '03 - Troisième titre.lrc'
    }
    // copie un bloc { ... }, sépare-les par une virgule
  ]
};
