#!/usr/bin/env python3
"""
Job Security Monitor - Supabase Cloud Version (Resilient)
Reads telemetry from Teensy 4.1 and pushes to Supabase for public dashboard
Built with SYMBEYOND - Human & AI Collaboration

RESILIENT FEATURES:
- Auto-reconnects when Teensy/Job Security powers on
- Handles USB disconnect/reconnect gracefully
- Never crashes, never requires manual restart
- Logs system offline/online transitions
"""

import serial
import serial.tools.list_ports
import time
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
import threading
import queue
import re

# Load environment variables
load_dotenv('/opt/js-monitor/.env')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Configuration
BAUD_RATE = 115200
UPDATE_INTERVAL = 3  # seconds between Supabase updates
RECONNECT_DELAY = 5  # seconds between reconnection attempts
EVENT_QUEUE = queue.Queue()

# Global state
current_telemetry = {
    'y_position': 0,
    'z_position': 0,
    'status': 'INITIALIZING',
    'fram_writes': 0,
    'fram_total': 1000,  # Default to avoid division by zero
    'uptime_mins': 0,
    'is_awake': False
}

startup_time = time.time()
system_online = False


def find_teensy():
    """Find the Teensy serial port - returns None if not found"""
    # Common Teensy ports
    common_ports = ['/dev/ttyACM0', '/dev/ttyUSB0', '/dev/ttyACM1']
    
    # Try common ports first
    for port in common_ports:
        if os.path.exists(port):
            try:
                ser = serial.Serial(port, BAUD_RATE, timeout=1)
                return ser
            except Exception as e:
                pass
    
    # Scan all ports
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if 'teensy' in port.description.lower() or 'usb' in port.description.lower():
            try:
                ser = serial.Serial(port.device, BAUD_RATE, timeout=1)
                return ser
            except Exception as e:
                pass
    
    return None


def parse_telemetry(line):
    """Parse telemetry data from serial line"""
    global current_telemetry
    
    # Position data: "📝 Telemetry: Y=123, Z=456"
    if "Telemetry:" in line:
        match = re.search(r'Y=(-?\d+),\s*Z=(-?\d+)', line)
        if match:
            current_telemetry['y_position'] = int(match.group(1))
            current_telemetry['z_position'] = int(match.group(2))
            current_telemetry['is_awake'] = True
    
    # FRAM health: "Position records: 1 of 1000"
    if "Position records:" in line:
        match = re.search(r'(\d+)\s+of\s+(\d+)', line)
        if match:
            current_telemetry['fram_writes'] = int(match.group(1))
            current_telemetry['fram_total'] = int(match.group(2))
    
    # System ready
    if "System Ready" in line or "TRUE HOME Established" in line or "TRUE-HOME complete" in line:
        current_telemetry['is_awake'] = True
        current_telemetry['status'] = 'RUNNING'
    
    # Initializing
    if "INITIALIZING" in line or "Searching for home" in line:
        current_telemetry['status'] = 'INITIALIZING'
    
    # Calculate uptime
    current_telemetry['uptime_mins'] = int((time.time() - startup_time) / 60)


def log_event(event_type, message, y_pos=None, z_pos=None, fram_health=None):
    """Queue an event for logging to Supabase"""
    event = {
        'event_type': event_type,
        'message': message,
        'y_position': y_pos or current_telemetry['y_position'],
        'z_position': z_pos or current_telemetry['z_position'],
        'fram_health': fram_health
    }
    EVENT_QUEUE.put(event)


def supabase_writer():
    """Background thread to push data to Supabase"""
    print("🌐 Supabase writer thread started")
    last_update = 0
    
    while True:
        try:
            current_time = time.time()
            
            # Update telemetry every UPDATE_INTERVAL seconds
            if current_time - last_update >= UPDATE_INTERVAL:
                # Insert new telemetry record (not upsert - we want history)
                data = {
                    'y_position': current_telemetry['y_position'],
                    'z_position': current_telemetry['z_position'],
                    'status': current_telemetry['status'],
                    'fram_writes': current_telemetry['fram_writes'],
                    'fram_total': current_telemetry['fram_total'],
                    'uptime_mins': current_telemetry['uptime_mins'],
                    'is_awake': current_telemetry['is_awake']
                }
                
                supabase.table('telemetry').insert(data).execute()
                last_update = current_time
            
            # Process event queue
            while not EVENT_QUEUE.empty():
                event = EVENT_QUEUE.get()
                try:
                    supabase.table('events').insert(event).execute()
                    print(f"📊 Logged event: {event['event_type']}")
                except Exception as e:
                    print(f"⚠️  Failed to log event: {e}")
            
            time.sleep(0.5)
            
        except Exception as e:
            print(f"⚠️  Supabase error: {e}")
            time.sleep(5)


def serial_reader_resilient():
    """
    Resilient serial reader that auto-reconnects
    This runs forever and handles all connection issues gracefully
    """
    global system_online, startup_time
    
    print("📡 Resilient serial reader started")
    ser = None
    
    while True:
        try:
            # Try to connect if not connected
            if ser is None or not ser.is_open:
                if system_online:
                    # Transition to offline
                    print("⚠️  Job Security disconnected - entering standby mode")
                    log_event('SYSTEM', 'Job Security powered off or disconnected')
                    current_telemetry['status'] = 'OFFLINE'
                    current_telemetry['is_awake'] = False
                    system_online = False
                
                # Try to find Teensy
                ser = find_teensy()
                
                if ser:
                    # Successfully connected!
                    print(f"✅ Job Security online - connected to {ser.port}")
                    log_event('SYSTEM', 'Job Security powered on and connected')
                    current_telemetry['status'] = 'INITIALIZING'
                    startup_time = time.time()  # Reset uptime counter
                    system_online = True
                else:
                    # Not found, wait and retry
                    if not system_online:
                        print(f"⏳ Waiting for Job Security to power on... (retry in {RECONNECT_DELAY}s)")
                    time.sleep(RECONNECT_DELAY)
                    continue
            
            # Read from serial
            if ser and ser.is_open:
                try:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                    
                    if line:
                        print(f"[JS] {line}")
                        
                        # Parse telemetry
                        parse_telemetry(line)
                        
                        # Log important events
                        if "Manual solenoid" in line:
                            log_event('SOLENOID', line)
                        
                        elif "FRAM MEMORY PALACE STATUS" in line:
                            log_event('FRAM_STATUS', line,
                                     fram_health=current_telemetry['fram_writes'])
                        
                        elif "STATE LOGGED" in line or "STATE_CHANGE" in line:
                            log_event('STATE_CHANGE', line)
                        
                        elif "TRUE HOME" in line or "TRUE-HOME" in line:
                            log_event('SYSTEM', line)
                
                except serial.SerialException as e:
                    # Serial port died - close it and trigger reconnection
                    print(f"⚠️  Serial error: {e}")
                    if ser:
                        try:
                            ser.close()
                        except:
                            pass
                    ser = None
                    
                except Exception as e:
                    # Other errors - log but don't crash
                    print(f"⚠️  Read error: {e}")
                    time.sleep(1)
        
        except Exception as e:
            # Catch-all for any unexpected errors
            print(f"❌ Unexpected error in serial reader: {e}")
            if ser:
                try:
                    ser.close()
                except:
                    pass
            ser = None
            time.sleep(RECONNECT_DELAY)


def main():
    """Main function"""
    print("=" * 60)
    print("🎨 JOB SECURITY MONITOR - RESILIENT CLOUD VERSION")
    print("=" * 60)
    print(f"📍 Supabase URL: {SUPABASE_URL}")
    print(f"⏱️  Update interval: {UPDATE_INTERVAL}s")
    print(f"🔄 Auto-reconnect: Every {RECONNECT_DELAY}s when offline")
    print("=" * 60)
    print("💙 SYMBEYOND Resilient Mode")
    print("   - Auto-reconnects when Job Security powers on")
    print("   - Handles power cycles gracefully")
    print("   - Never requires manual restart")
    print("=" * 60)
    
    # Start background threads
    writer_thread = threading.Thread(target=supabase_writer, daemon=True)
    writer_thread.start()
    
    reader_thread = threading.Thread(target=serial_reader_resilient, daemon=True)
    reader_thread.start()
    
    print("✅ Monitor running in resilient mode")
    print("⏳ Waiting for Job Security to come online...")
    print("Press Ctrl+C to stop")
    
    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        log_event('SYSTEM', 'Job Security Monitor stopped')
        time.sleep(2)  # Give time to send final event


if __name__ == "__main__":
    main()
