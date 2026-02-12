# 🛡️ Minecraft Guardian

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Minecraft](https://img.shields.io/badge/Minecraft-%23113311.svg?style=for-the-badge&logo=minecraft&logoColor=white)](https://www.minecraft.net/)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

**Minecraft Guardian** is a powerful, automated server manager designed to simplify the lifecycle of a Minecraft server. Built with **Bun** and **TypeScript**, it handles everything from Java installation and server core updates to automated backups and P2P networking.

---

## ✨ Key Features

- 🛠️ **Automated Environment**: Automatically downloads and manages the correct Java version (JDK) required for your Minecraft server.
- ⏬ **Core Management**: Supports automatic downloading of server cores like **Paper**, **Spigot**, and more. Handles **EULA agreement** automatically.
- 📉 **Lifecycle Management**: Advanced process "Guardian" that monitors the server, handles crashes, and triggers automatic restarts. Includes **graceful shutdown** logic to prevent world corruption.
- 🔌 **Plugin System**: Modular architecture allowing features like:
  - **REST & WebSocket API**: Remote server control and real-time monitoring.
  - **Automated Backups**: Configurable cron-based backups with compression and `save-off/on` synchronization.
  - **Tunneling**: Integrated support for exposing your server (Playit.gg).
  - **Terminal UI**: Clean, formatted console output and command handling.
- 🌐 **P2P Networking**: Built-in `libp2p` support for decentralized peer discovery and secure connections.
- 🛡️ **Security**: Automatic **checksum verification** for Java downloads to ensure file integrity.
- 🐳 **Docker Ready**: Full Docker and Docker Compose support for easy containerization.
- 📦 **Cross-Platform**: Compiled binaries for Linux, Windows, and macOS (x64 & ARM64).

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0.0 or higher)
- Git

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/nglmercer/minecraft-server.git
   cd minecraft-server
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

### Running the Server

To start the Guardian and the Minecraft server:

```bash
bun run start
```

On first run, the Guardian will:

1. Load `config/config.yaml`.
2. Check if the specified Java version is installed. If not, it downloads the correct JDK and **verifies its checksum**.
3. Download the requested Minecraft server core (e.g., Paper 1.21.1) and **accept the EULA**.
4. Launch the Minecraft server and begin monitoring the process.

---

## 🐳 Docker Deployment

You can run Minecraft Guardian easily using Docker Compose:

```bash
docker-compose up -d
```

### Configured Ports:

- `25565`: Minecraft Server
- `3000`: API Control/WebInterface
- `9000`: Libp2p P2P Network

---

## ⚙️ Configuration

The main configuration is located in `config/config.yaml`. Here you can define:

- **Server Version**: Choose your core (Paper, Spigot) and version.
- **JVM Options**: Memory allocation (Xmx/Xms) and custom flags.
- **Guardian Settings**: Auto-restart policies and retry limits.
- **Plugin Configs**: Enabling/disabling API, Tunnels, and Backup schedules.

---

## 🧩 Plugins

| Plugin       | Description                                                  |
| :----------- | :----------------------------------------------------------- |
| **API**      | Provides REST endpoints and WebSockets for external control. |
| **Backup**   | Automated, compressed backups of your world and config.      |
| **Terminal** | Handles interactive console and pretty-printing logs.        |
| **Tunnel**   | Integration for secure tunneling services.                   |
| **Libp2p**   | Peer-to-peer discovery and connectivity.                     |

---

## 🛠️ Development

### Type Checking

```bash
bun run typecheck
```

### Build Binaries

To build standalone executable binaries for all platforms:

```bash
bun run build
```

---

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

Developed with ❤️ by [nglmercer](https://github.com/nglmercer)
