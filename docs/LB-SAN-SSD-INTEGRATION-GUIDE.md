# LanguageBridge Backend Setup: 4TB SAN SSD Integration Guide

**Purpose:** Integrate the 4TB SAN SSD Thunderbolt 3 into your development and backup workflow

**For:** Justin Bernard & Prentice Howard

**Status:** Ready to execute before starting backend rebuild

---

## Why the SAN SSD Matters

Your 4TB SAN SSD (via Thunderbolt 3) gives you:

1. **Real-time backup** of all code while you develop
2. **Fast synchronization** between your two M4 MacBooks
3. **ML model storage** (Kokoro weights are large - won't clutter your laptop SSD)
4. **Audio cache testing** without hitting Azure Blob Storage limits
5. **Complete redundancy** if your laptop dies mid-rebuild

---

## Setup Steps (Do This First)

### Step 1: Connect the SAN SSD

```bash
# Plug the Thunderbolt 3 cable into your MacBook Air

# Verify it mounted
diskutil list
# You should see something like:
# /dev/diskX (external, physical)
```

### Step 2: Format the SAN SSD (if new)

```bash
# Find the disk identifier
diskutil list

# Initialize the SAN SSD with APFS format
# REPLACE diskX with your actual disk (e.g., disk2, disk3)
diskutil eraseVolume APFS "LanguageBridge-Backup" /dev/diskX

# Verify it mounted
ls /Volumes/ | grep LanguageBridge
# Should show: LanguageBridge-Backup
```

### Step 3: Create Directory Structure on SAN SSD

```bash
# Create backup folders
mkdir -p /Volumes/LanguageBridge-Backup/projects
mkdir -p /Volumes/LanguageBridge-Backup/documents
mkdir -p /Volumes/LanguageBridge-Backup/ml-models
mkdir -p /Volumes/LanguageBridge-Backup/audio-cache-test
mkdir -p /Volumes/LanguageBridge-Backup/archives

# Create symlinks for easy access
ln -s /Volumes/LanguageBridge-Backup ~/LanguageBridge-Backup
```

### Step 4: Create Initial Backup

```bash
# Copy your entire projects folder to the SAN SSD
# (Do this BEFORE you start the rebuild, so you have a baseline)
cp -r ~/projects /Volumes/LanguageBridge-Backup/

# This takes 5-10 minutes depending on what you have
# Once done, you have a complete backup
```

### Step 5: Set Up Auto-Sync Script

Create a backup script that runs daily:

```bash
cat > ~/backup-to-san.sh << 'EOF'
#!/bin/bash

# LanguageBridge SAN SSD Backup Script
# Syncs ~/projects to SAN SSD every time you run it
# Add to cron to run automatically

BACKUP_DIR="/Volumes/LanguageBridge-Backup/projects"
SOURCE_DIR="$HOME/projects"
TIMESTAMP=$(date '+%Y-%m-%d_%H:%M:%S')
LOG_FILE="$HOME/LanguageBridge-Backup/sync-log.txt"

echo "[$TIMESTAMP] Starting backup..." >> "$LOG_FILE"

# Check if SAN SSD is mounted
if [ ! -d "$BACKUP_DIR" ]; then
    echo "[$TIMESTAMP] ERROR: SAN SSD not mounted at $BACKUP_DIR" >> "$LOG_FILE"
    exit 1
fi

# Sync using rsync (faster than cp, only copies changes)
rsync -av --delete "$SOURCE_DIR/" "$BACKUP_DIR/" >> "$LOG_FILE" 2>&1

RESULT=$?
if [ $RESULT -eq 0 ]; then
    echo "[$TIMESTAMP] Backup completed successfully" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] Backup failed with code $RESULT" >> "$LOG_FILE"
fi
EOF

# Make it executable
chmod +x ~/backup-to-san.sh
```

### Step 6: Test the Backup Script

```bash
# Run it manually first to verify it works
~/backup-to-san.sh

# Check the log
cat ~/LanguageBridge-Backup/sync-log.txt
```

### Step 7: Set Up Daily Auto-Sync (Optional but Recommended)

```bash
# Create a LaunchAgent plist file
cat > ~/Library/LaunchAgents/com.languagebridge.backup.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.languagebridge.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YourUsername/backup-to-san.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>86400</integer>
    <!-- Runs every 24 hours (86400 seconds) -->
    <key>StandardOutPath</key>
    <string>/Users/YourUsername/LanguageBridge-Backup/cron-out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YourUsername/LanguageBridge-Backup/cron-err.log</string>
</dict>
</plist>
EOF

# Load the LaunchAgent
launchctl load ~/Library/LaunchAgents/com.languagebridge.backup.plist

# Verify it's loaded
launchctl list | grep languagebridge
```

---

## Development Workflow with SAN SSD

### Daily Routine

```bash
# Morning: Check if SAN SSD is connected
ls /Volumes/LanguageBridge-Backup
# If it shows: LanguageBridge-Backup, you're good

# Start work as normal in ~/projects/languagebridge-rebuild
cd ~/projects/languagebridge-rebuild
git status
npm run dev:backend

# Before lunch: Manual backup
~/backup-to-san.sh

# Before end of day: Manual backup
~/backup-to-san.sh

# Before unplugging SAN SSD: Verify backup is current
ls -lh /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/backend/
# Should show today's date on recent files
```

### Syncing Between Two MacBooks

Once you have the SAN SSD backup, Prentice can sync to his MacBook:

**On Prentice's MacBook:**

```bash
# Connect same SAN SSD via Thunderbolt 3
# Then sync from SAN to his local drive
rsync -av /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/ ~/projects/languagebridge-rebuild/

# Now both of you have identical copies
```

**Option: Make SAN SSD the Source of Truth**

If you want the SAN SSD to be your main source:

```bash
# Create symlink on your MacBook
rm -rf ~/projects/languagebridge-rebuild
ln -s /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild ~/projects/languagebridge-rebuild

# Now ~/projects/languagebridge-rebuild IS the SAN SSD
# Changes are instant
# No manual backup needed
```

**Warning:** Only do this if your SAN SSD is plugged in always. If you unplug it, your ~/projects symlink breaks.

---

## ML Model Storage on SAN SSD

Later (in Volume 4), you'll fine-tune Kokoro-82M models. These are large (1-2GB each):

```bash
# Create ML models folder on SAN SSD
mkdir -p /Volumes/LanguageBridge-Backup/ml-models

# Symlink from your project
mkdir -p ~/projects/languagebridge-rebuild/ml-pipeline/models
ln -s /Volumes/LanguageBridge-Backup/ml-models ~/projects/languagebridge-rebuild/ml-pipeline/models/proprietary

# Now when you save fine-tuned weights:
# ~/projects/languagebridge-rebuild/ml-pipeline/models/proprietary/kokoro-dari-v1.pt
# They're actually stored on the SAN SSD (not your laptop SSD)

# Add to .gitignore (in your root .gitignore)
echo "ml-pipeline/models/proprietary/**" >> .gitignore
```

---

## Audio Cache Testing on SAN SSD

Later, you'll want to test the audio caching without hitting Azure:

```bash
# Create local test cache on SAN SSD
mkdir -p /Volumes/LanguageBridge-Backup/audio-cache-test

# Create symlink
mkdir -p ~/.languagebridge
ln -s /Volumes/LanguageBridge-Backup/audio-cache-test ~/.languagebridge/test-cache

# In your tts-router function, add an environment variable:
# TEST_CACHE_DIR=~/.languagebridge/test-cache

# When testing locally, tts-router can cache to SAN SSD instead of Azure
```

---

## Disaster Recovery

### If Your Laptop Dies

```bash
# Connect SAN SSD to a new MacBook
# Copy back your projects
cp -r /Volumes/LanguageBridge-Backup/projects ~/

# You're back to work in 10 minutes
```

### If You Accidentally Delete Something

```bash
# Check the SAN SSD for an older version
ls -la /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/backend/

# Restore from backup
cp -r /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild ~/projects/languagebridge-rebuild-restored
```

### Verify Backup Integrity

```bash
# Check that both copies are identical
diff -r ~/projects/languagebridge-rebuild /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild

# If no output, they're identical
# If differences, something went wrong with sync
```

---

## Before Starting the Backend Rebuild

Complete this checklist:

- [ ] SAN SSD connected and formatted
- [ ] Directory structure created on SAN SSD
- [ ] Initial backup completed
- [ ] Backup script tested
- [ ] LaunchAgent auto-sync configured (optional)
- [ ] Symlinks created or decision made (symlink vs manual sync)
- [ ] Verified backup integrity
- [ ] Prentice knows where the SAN SSD is

Then start Part 1 of the backend rebuild.

---

## Troubleshooting

### SAN SSD Not Mounting

```bash
# Check if it appears
diskutil list

# If not listed, try:
# 1. Replug the Thunderbolt 3 cable
# 2. Restart the MacBook
# 3. Try a different Thunderbolt 3 port
```

### rsync Permission Denied

```bash
# You might need to allow permissions
sudo chown -R $(whoami) /Volumes/LanguageBridge-Backup

# Then retry the sync
~/backup-to-san.sh
```

### Symlink Broken

```bash
# If you created a symlink and it's broken:
# First, check if SAN SSD is still mounted
ls /Volumes/LanguageBridge-Backup

# If not mounted, plug it in again
# If mounted but symlink broken, recreate it:
rm ~/projects/languagebridge-rebuild
ln -s /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild ~/projects/languagebridge-rebuild
```

### LaunchAgent Not Running

```bash
# Check if it's loaded
launchctl list | grep languagebridge

# If not listed, load it manually
launchctl load ~/Library/LaunchAgents/com.languagebridge.backup.plist

# Check for errors
cat ~/LanguageBridge-Backup/cron-err.log
```

---

## Recommended Setup for You and Prentice

### Option A: SAN SSD as Shared Source of Truth

Both of you sync to the same SAN SSD:

```
Justin's MacBook ←→ SAN SSD ←→ Prentice's MacBook
```

**Setup:**
1. Justin develops on his MacBook, syncs to SAN SSD every 4 hours
2. Prentice syncs from SAN SSD to his MacBook every 4 hours
3. Both work independently, SAN SSD is the source
4. No merge conflicts (you work on different files)

**Command for Prentice to sync:**
```bash
rsync -av /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/ ~/projects/languagebridge-rebuild/
```

### Option B: Each MacBook Uses GitHub + SAN SSD Backup

Both of you push to GitHub, and each person backs up to SAN SSD:

```
Justin: MacBook → GitHub → SAN SSD (backup)
Prentice: MacBook → GitHub → SAN SSD (backup)
```

**Setup:**
1. You work on your MacBook, commit to GitHub
2. Prentice pulls from GitHub to his MacBook
3. Each person syncs to SAN SSD as backup
4. SAN SSD has latest code from both of you

**This is recommended for safety** (GitHub is your real source of truth, SAN SSD is backup)

### Option C: SAN SSD as Working Directory (Fastest)

Both use the SAN SSD as the actual working directory:

```
Justin: MacBook → SAN SSD ← Prentice's MacBook
```

**Setup:**
1. Plug SAN SSD in
2. Work directly on SAN SSD files
3. Both of you change the same files in real-time
4. No syncing needed

**Caveat:** Only works if SAN SSD is always plugged in and both of you have it nearby

---

## Recommended for LanguageBridge

**Use Option B (GitHub + SAN SSD Backup):**

1. You develop on your M4 MacBook
2. You push to GitHub every 2-3 hours
3. You sync ~/projects to SAN SSD every morning and evening
4. Prentice pulls from GitHub to his MacBook
5. Prentice syncs SAN SSD as backup
6. If either laptop dies, you restore from GitHub (main) or SAN SSD (backup)

This gives you:

✓ Two separate development machines
✓ Real-time sync via GitHub
✓ Complete backup on SAN SSD
✓ Disaster recovery path
✓ No conflicts

---

## Commands You'll Run Frequently

```bash
# Check if SAN SSD is connected
ls /Volumes/ | grep LanguageBridge

# Manual backup to SAN SSD
~/backup-to-san.sh

# Verify backup is current
ls -lh /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/

# Prentice syncs from SAN SSD
rsync -av /Volumes/LanguageBridge-Backup/projects/languagebridge-rebuild/ ~/projects/languagebridge-rebuild/

# Check auto-sync is working
launchctl list | grep languagebridge

# View sync logs
tail -f ~/LanguageBridge-Backup/sync-log.txt
```

---

## Start the Backend Rebuild

Once the SAN SSD is set up and the initial backup is done, you're ready to start Part 1 of the backend rebuild.

The SAN SSD will automatically back up all your work as you build:

```bash
# Every morning and evening
~/backup-to-san.sh

# Or let the LaunchAgent do it automatically every 24 hours

# Either way, you have a complete copy of your work on the SAN SSD
```

---

**LanguageBridge LLC | SAN SSD Integration | March 2026**

Justin Bernard - justin@languagebridge.app

Prentice Howard - prentice@languagebridge.app
