# Running Sparks on your own computer (Windows 11)

This runs Sparks on one PC so you can try it while it's being built. It uses fake demo data.
When the build is done, Sparks moves to proper hosting (Azure) and this local copy can be removed.

## Quickest way: one paste

1. Press the **Windows key**, type **PowerShell**, press Enter.
2. Paste this line and press Enter:

   ```
   irm https://raw.githubusercontent.com/los1818/Star-Electric-Website/claude/cool-turing-1117wj/sparks/scripts/install-windows.ps1 | iex
   ```

It downloads Sparks to `C:\Sparks\app`, puts a **Sparks** icon on your desktop and starts it. It installs
Node.js and opens Docker Desktop for you if needed. (If Docker Desktop isn't installed at all, it
installs it and asks you to restart the PC once; after that, double-click the Sparks icon.)

After that, just double-click the **Sparks** desktop icon. It checks for a newer version each time,
installs it if there is one (your data, settings and photos are kept), then starts Sparks. No more
pasting. If the internet is down, it starts the version you have.

The rest of this page is the manual way.

## 1. Install two programs (one time, about 15 minutes)

1. **Node.js**: go to https://nodejs.org, download the **LTS** version, and run the installer
   with the default options.
2. **Docker Desktop**: go to https://www.docker.com/products/docker-desktop/, download
   **Docker Desktop for Windows**, and run the installer with the default options.
   - It may ask to install or update **WSL** (Windows Subsystem for Linux). Say yes.
   - **Restart the computer** when it asks.
   - Open **Docker Desktop** from the Start menu, accept the terms, and skip signing in.
     Wait until the bottom-left corner says **Engine running**.
   - Docker Desktop is free for businesses with fewer than 250 employees and under US$10 million
     in revenue.

## 2. Download Sparks

1. Download the ZIP:
   https://github.com/los1818/Star-Electric-Website/archive/refs/heads/claude/cool-turing-1117wj.zip
2. In your Downloads folder, **right-click the ZIP → Properties**, tick **Unblock** at the bottom
   (if it's there), and click **OK**. This stops Windows from blocking the start script.
3. Right-click the ZIP → **Extract All…** and extract it to `C:\Sparks`.
4. Open `C:\Sparks`, then the folder inside it, then the **`sparks`** folder.
   Keep this folder named `sparks`: your data is stored under that name.

## 3. Start it

1. Make sure **Docker Desktop is open** and says **Engine running**.
2. In the `sparks` folder, double-click **`Start Sparks (Windows).cmd`**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**.
3. A black window opens and works through these steps:
   creating settings → installing app components → starting the database → updating the database →
   loading demo data. **The first time takes 3–5 minutes**; after that, about 30 seconds.
4. Your browser opens **http://localhost:3100** by itself. If it doesn't, open that address yourself.
   Sparks always uses port **3100**, so it won't clash with other programs on 3000 or 3001.
   To try it on your phone, connect the phone to the same Wi-Fi and open the "From a phone" address
   the window shows (like `http://192.168.0.40:3100`). The first time, Windows may ask whether to allow
   Node.js on private networks: click **Allow**.
5. Sign in by clicking one of the **Development login** names:

   | Click | You see Sparks as |
   |---|---|
   | Alex Admin | Administrator (everything, including Settings) |
   | Olivia Office | Office staff |
   | Marcus Lindqvist | Technician (limited view) |
   | Nolan Newhire | A new person waiting for access |

**Leave the black window open while you use Sparks.** Close it (or press Ctrl+C in it) to stop Sparks.
To use it again later: open Docker Desktop, then double-click `Start Sparks (Windows).cmd`.

## Loading your real data (Trimble exports and users)

1. Put the files in **`C:\Sparks\import`** (create the folder if it isn't there):
   the Trimble **Customers** and **Jobs** CSV exports, and optionally the Accubid **inventory** `.xlsx`
   and a **users** `.csv` (columns `Name,User Name,Role`, roles `Administrator`, `Office` or `Basic User`).
2. Double-click **`Import Trimble Data (Windows).cmd`** in `C:\Sparks\app`.
3. It checks the files first and shows what it found. Type **YES** to load them.
   The first time, this replaces the demo data. Your admin and office demo logins are kept.

Newer exports later? Drop them in the same folder and run it again: records are updated, never duplicated.

## Getting a newer version

Nothing to do: the **Sparks** desktop icon updates itself each time you start it. Your data,
settings and photos (the `storage` folder) are kept.

## Starting over with fresh demo data

Open the `sparks` folder, click the address bar, type `powershell` and press Enter, then run:

```
powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -ResetDemo
```

This **wipes everything** and reloads the demo data.

## If something goes wrong

| Message | What to do |
|---|---|
| "Docker Desktop isn't running" | Open Docker Desktop, wait for **Engine running**, try again. |
| "Node.js isn't installed" / "too old" | Install the **LTS** version from https://nodejs.org, then try again. |
| "The database didn't start" | Restart Docker Desktop (whale icon by the clock → Restart) and try again. Another program using port 55432 can also cause this. |
| The browser says the site can't be reached | Wait a minute (the first start compiles pages), then refresh. Make sure the black window is still open. |
| Pages are slow the first time you open them | Normal in this test mode: each page is prepared the first time it's opened. |

## On a Mac

Same steps, but install Docker Desktop for Mac, and in Terminal run `bash scripts/start-local.sh`
from the `sparks` folder (or double-click `Start Sparks (Mac).command`).
