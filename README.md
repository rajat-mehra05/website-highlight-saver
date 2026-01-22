# Website Highlight Saver

A Chrome extension that allows users to highlight and save text from any webpage with local storage and AI-powered summarization.

## 🎬 Working Demo

![Website Highlight Saver Demo](highlight.gif)

_Watch the extension in action: Select text, save highlights, and navigate between them seamlessly._

## Features

- **Text Selection & Saving**: Select any text on any webpage to save as a highlight
- **AI Summarization**: Get instant AI-powered summaries using OpenAI
- **Local Storage**: All highlights saved locally using Chrome's storage API
- **Search & Filter**: Search highlights by text, domain, or title
- **Export/Import**: Backup and restore highlights as JSON files
- **Visual Highlighting**: Saved highlights marked with yellow background
- **Cross-Page Persistence**: Highlights persist across browser sessions
- **URL Navigation**: Navigate directly to specific highlights via URL fragments

## 🚀 Installation

1. **Download or clone this repository**

2. **Create icon files** (required):

   - Create 16x16, 48x48, and 128x128 pixel PNG icons
   - Replace the placeholder files in the `icons/` folder:
     - `icons/icon16.png`
     - `icons/icon48.png`
     - `icons/icon128.png`

   You can use any image editor or online icon generator to create simple highlight-themed icons.

3. **Configure AI (Optional)**: Create an `env.config` file in the root directory:

   ```
   OPENAI_API_KEY=your_openai_api_key_here
   AI_MODEL=gpt-4
   AI_MAX_TOKENS=150
   AI_TEMPERATURE=0.8
   AI_TIMEOUT=10000
   ```

4. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension folder
   - The extension icon should appear in your Chrome toolbar

## 🌐 Browser Compatibility

- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)
- Other Chromium-based browsers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🆘 Support

If you encounter any issues or have feature requests, please create an issue in the repository.

**Note**: This extension stores all data locally in your browser. Only text sent for AI summarization is transmitted to OpenAI's servers.
