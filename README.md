# IC2u_Bot

A Telegram bot for the INTERNATIONAL CONGRESS 2025, Sri Lanka, designed for AIESECers to register, view daily tasks, submit responses (text and images), and track their scores in a gamified congress experience.

## Features
- **User Registration**: Collects full name, Telegram handle, email, and entity.
- **Task Viewer**: Displays daily congress tasks (text/image) after password authentication.
- **Response Submission**: Accepts text and image responses for tasks, stores them, and evaluates them.
- **Scoring System**: Awards points for valid responses and allows users to view their daily and total scores.
- **Google Sheets Integration**: Stores registration, tasks, responses, and scores in Google Sheets.
- **Google Drive Integration**: Uploads image responses to Google Drive.
- **Main Menu Navigation**: Easy-to-use inline keyboard for all main actions.

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- Telegram Bot Token
- Google Cloud credentials for Sheets and Drive APIs
- Gemini API Key (for generative AI features)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/MrSilent2001/IC2u_Bot.git
   cd IC2u_Bot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```env
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   GEMINI_API_KEY=your_gemini_api_key
   GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account",...}' # JSON string
   SHEET_ID=your_google_sheet_id
   DRIVE_FOLDER_ID=your_drive_folder_id
   ```
   - You can also place your Google credentials in `google-sheets-credentials.json` and reference it in your config if preferred.

### Running the Bot
```bash
npm start
```

## Usage
- **/start**: Begin registration. Send your details in this format:
  ```
  Full Name
  @telegramhandle
  email@example.com
  Entity
  ```
- **Main Menu**: Use inline buttons to:
  - View Tasks (requires daily password)
  - Submit Responses (text/image)
  - View Score

### Task Submission
- **Text**: Send `Task Number` and `Your Response` on separate lines.
- **Image**: Send `Task Number` first, then upload your image.

## Configuration
- All sensitive keys and IDs are loaded from environment variables.
- Google Sheets and Drive APIs require a service account with appropriate permissions.

## Dependencies
- express, node-telegram-bot-api, googleapis, google-spreadsheet, @google/generative-ai, dayjs, dotenv, uuid, node-cron, and more (see `package.json`).

## License
ISC

## Author
[MrSilent2001](https://github.com/MrSilent2001)

