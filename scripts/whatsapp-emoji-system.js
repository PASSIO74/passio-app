// ═══════════════════════════════════════════════════════════
// SYSTÈME EMOJI/GIF COMPLET STYLE WHATSAPP
// ═══════════════════════════════════════════════════════════

// EMOJIS PAR CATÉGORIES (comme WhatsApp)
var EMOJI_CATEGORIES = {
  "😊": {  // Récent
    name: "Récent",
    emojis: ["😀", "😂", "❤️", "👍", "🔥", "✨"]
  },
  "😄": {  // Émojis et personnes
    name: "Émojis et personnes",
    emojis: ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😇", "🥰", "😍", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😌", "😔", "😑", "😐", "😶", "😏", "😒", "🙄", "😬", "🤐", "😷", "😷", "🤒", "🤕", "🤮", "🤮", "🤧", "🤥", "🤓", "😎", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "🙈", "🙉", "🙊"]
  },
  "🌍": {  // Nature
    name: "Nature",
    emojis: ["🌙", "⭐", "🌟", "✨", "⚡", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "☃️", "⛄", "🌬️", "💨", "💧", "💦", "☔", "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥑", "🍅", "🍆", "🥒", "🥬", "🥦", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🥓", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🍰", "🎂", "🧁", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🍯", "🥛", "🥤", "☕", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧃"]
  },
  "🚗": {  // Voyage et lieux
    name: "Voyage et lieux",
    emojis: ["✈️", "🚀", "🛸", "🚁", "🚂", "🚊", "🚝", "🚄", "🚅", "🚈", "🚞", "🚋", "🚃", "🚌", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🚚", "🚛", "🚜", "🏎️", "🏍️", "🛵", "🦯", "🛴", "🚲", "🛹", "🛼", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛰️", "🚁", "🛶", "⛵", "🚤", "🛳️", "⛴️", "🛥️", "🚢", "🚧", "⛽", "🚨", "🚥", "🚦", "🏁", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇦🇫", "🇦🇽", "🇦🇱", "🇩🇿", "🇦🇸", "🇦🇩", "🇦🇴"]
  },
  "⚽": {  // Activités
    name: "Activités",
    emojis: ["🎯", "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎳", "🏓", "🏸", "🥊", "🥋", "🥅", "⛳", "⛸️", "🎣", "🎽", "🎿", "⛷️", "🏂", "🪂", "🛷", "🥌", "🎱", "🎮", "🎰", "🎲", "♠️", "♥️", "♦️", "♣️", "♟️", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲", "🎯", "🎳", "🎮", "🎰", "🧩", "♾️"]
  },
  "💡": {  // Objets
    name: "Objets",
    emojis: ["💡", "🔦", "🏮", "📔", "📕", "📖", "📗", "📘", "📙", "📚", "📓", "📒", "📑", "🧷", "🧷", "🧹", "🧺", "🧻", "🧼", "🧽", "🧯", "🛒", "🚚", "🚛", "🚐", "🚙", "🚗", "🚕", "🚌", "🚎", "🏎️", "🏍️", "🛵", "🦯", "🛴", "🚲", "🛹", "🛼", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛰️", "🚁", "🛶", "⛵", "🚤", "🛳️", "⛴️", "🛥️", "🚢", "🚧"]
  },
  "❤️": {  // Symboles
    name: "Symboles",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🤜", "🤛", "🦾", "🦿", "🦵", "🦶", "👂", "👃", "🧠", "🦷", "🦴", "🦳"]
  }
};

// ÉNORMÉMENT DE GIFS (60+)
var DEFAULT_GIFS_LARGE = [
  // Reactions populaires
  "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  "https://media.giphy.com/media/xT9IgG50Lg7rusjtG8/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
  "https://media.giphy.com/media/3oz8xAFtqoOUUrsh7W/giphy.gif",
  "https://media.giphy.com/media/l4FGGafcOHmrlQxG0/giphy.gif",
  "https://media.giphy.com/media/3ohzdKdb7d1bbVwnQU/giphy.gif",
  "https://media.giphy.com/media/l0HlFZ3c8HWDRlCharepI/giphy.gif",
  "https://media.giphy.com/media/FW8aI0tXVE8gKxYvRc/giphy.gif",
  "https://media.giphy.com/media/l0Iy1Z8oW4fvfBLh2/giphy.gif",
  "https://media.giphy.com/media/l0HlDtKUoRb0x8bDy/giphy.gif",
  "https://media.giphy.com/media/l0Iy0QcSoQYQW3SWHf/giphy.gif",
  "https://media.giphy.com/media/l0MYr7jgMgWI8ouOI/giphy.gif",
  "https://media.giphy.com/media/l0HlSY9x8FZo0XO1i/giphy.gif",
  "https://media.giphy.com/media/l4FgUMgdCHHBFcGe88/giphy.gif",
  "https://media.giphy.com/media/l4Jz3a8jO92crOLXy/giphy.gif",
  "https://media.giphy.com/media/3ohzdKdb7d1bbVwnQU/giphy.gif",
  "https://media.giphy.com/media/l0HlF5j3QRG5pxPAI/giphy.gif",
  "https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif",
  "https://media.giphy.com/media/l0MYM8m02D0c3PoFi/giphy.gif",
  "https://media.giphy.com/media/RH16FlVXbaAzS/giphy.gif",
  "https://media.giphy.com/media/l46Ce3kKMKxvEiFZS/giphy.gif",
  "https://media.giphy.com/media/l0HlHJJxcNHFqyvrm/giphy.gif",
  "https://media.giphy.com/media/JIX9RbDfLvbl2/giphy.gif",
  "https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif",
  "https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif",
  "https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif",
  "https://media.giphy.com/media/3ohzdKdb7d1bbVwnQU/giphy.gif",
  "https://media.giphy.com/media/l0HlFZ3c8HWDRlCharepI/giphy.gif",
  "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
  // Meme populaires
  "https://media.giphy.com/media/3ohzdKdb7d1bbVwnQU/giphy.gif",
  "https://media.giphy.com/media/l0HlFZ3c8HWDRlCharepI/giphy.gif",
  "https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif",
  "https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif",
  "https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif",
  "https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif",
  "https://media.giphy.com/media/l0MYM8m02D0c3PoFi/giphy.gif",
  "https://media.giphy.com/media/RH16FlVXbaAzS/giphy.gif",
  "https://media.giphy.com/media/l46Ce3kKMKxvEiFZS/giphy.gif",
  "https://media.giphy.com/media/l0HlHJJxcNHFqyvrm/giphy.gif",
  "https://media.giphy.com/media/JIX9RbDfLvbl2/giphy.gif",
  "https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif",
  "https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif",
  "https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif",
  "https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif",
  "https://media.giphy.com/media/l0MYM8m02D0c3PoFi/giphy.gif",
  "https://media.giphy.com/media/RH16FlVXbaAzS/giphy.gif",
  "https://media.giphy.com/media/l46Ce3kKMKxvEiFZS/giphy.gif",
  "https://media.giphy.com/media/l0HlHJJxcNHFqyvrm/giphy.gif",
  "https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif",
  "https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif",
  "https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif",
  "https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif",
  "https://media.giphy.com/media/l0MYM8m02D0c3PoFi/giphy.gif",
  "https://media.giphy.com/media/RH16FlVXbaAzS/giphy.gif",
  "https://media.giphy.com/media/l46Ce3kKMKxvEiFZS/giphy.gif",
  "https://media.giphy.com/media/l0HlHJJxcNHFqyvrm/giphy.gif",
  "https://media.giphy.com/media/JIX9RbDfLvbl2/giphy.gif",
  "https://media.giphy.com/media/l0HlQaQ6gWfllcjDO/giphy.gif",
  "https://media.giphy.com/media/l3q2K6HIuvsGyp7UE/giphy.gif",
  "https://media.giphy.com/media/l0HlMMaQ5vJ7lKOmY/giphy.gif",
  "https://media.giphy.com/media/3o7TKU8j7Yt9R2xNMY/giphy.gif"
];

console.log("✅ WhatsApp Emoji System loaded!");
console.log("📊 Emojis:", Object.keys(EMOJI_CATEGORIES).length, "catégories");
console.log("🎬 GIFs:", DEFAULT_GIFS_LARGE.length, "GIFs disponibles");
