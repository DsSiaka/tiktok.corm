# Overview

This is a Telegram bot application that generates special verification links for different social media platforms (YouTube, TikTok, Instagram). The system consists of a web server that creates unique links and a Telegram bot interface for user interaction. When users click on generated links, the application attempts to capture device information including camera access, location, and system details for verification purposes.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Components

**Express Web Server**: The main application runs on Express.js, handling HTTP requests for link generation and serving verification pages. The server uses in-memory storage with JavaScript objects to simulate a database for storing link mappings and captured user data.

**Telegram Bot Integration**: Uses the `node-telegram-bot-api` library to provide a conversational interface. The bot handles commands like `/start` and `/generate`, presenting users with platform selection options through inline keyboards.

**Link Generation System**: Utilizes the `shortid` library to create unique identifiers for each generated link. Links are mapped to specific platforms and stored in the in-memory `links` object.

**Client-Side Data Capture**: The verification pages include JavaScript that attempts to access user's camera via `getUserMedia()`, capture location through the Geolocation API, and collect system information from the browser.

## Data Flow

1. Users interact with the Telegram bot to select a platform
2. Bot sends a request to the web server's `/generate-link` endpoint
3. Server creates a unique ID and returns a verification URL
4. When the link is accessed, the server serves an HTML page with data capture scripts
5. Captured data is stored in the `capturedData` object

## Environment Configuration

The application uses `dotenv` for configuration management, supporting both Replit deployment (via `REPLIT_DOMAINS`) and local development environments. Key environment variables include `TELEGRAM_BOT_TOKEN`, `PORT`, and Replit-specific domains.

## Security Considerations

The application implements client-side data collection that requires user permissions for camera and location access. The verification process appears designed to collect device fingerprinting information for authentication purposes.

# External Dependencies

## Core Framework Dependencies
- **Express.js**: Web application framework for handling HTTP requests and serving pages
- **body-parser**: Middleware for parsing JSON and URL-encoded request bodies

## Telegram Integration
- **node-telegram-bot-api**: Official Telegram Bot API wrapper for Node.js
- **axios**: HTTP client for making requests between the bot and web server

## Utility Libraries
- **shortid**: Generates unique, URL-safe identifiers for link creation
- **dotenv**: Loads environment variables from .env files for configuration management

## Browser APIs
- **MediaDevices.getUserMedia()**: Accesses user's camera for image capture
- **Geolocation API**: Retrieves user's location coordinates
- **ImageCapture API**: Captures still images from video streams

## Deployment Platform
- **Replit**: Cloud development platform with specific environment variables (`REPLIT_DOMAINS`, `REPLIT_DB_URL`) for hosting and domain configuration