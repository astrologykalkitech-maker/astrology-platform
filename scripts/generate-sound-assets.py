import wave
import math
import struct
import os

SAMPLE_RATE = 44100

def generate_wav(filepath, duration_sec, sample_generator):
    num_samples = int(duration_sec * SAMPLE_RATE)
    with wave.open(filepath, 'w') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(SAMPLE_RATE)
        
        frames = bytearray()
        for i in range(num_samples):
            t = float(i) / SAMPLE_RATE
            val = sample_generator(t, duration_sec)
            val = max(-1.0, min(1.0, val))
            sample_int = int(val * 32767.0)
            frames.extend(struct.pack('<h', sample_int))
            
        wav_file.writeframes(frames)
    print(f"Generated {filepath} ({duration_sec}s, {len(frames)} bytes)")

out_dir = r"public\sounds"
os.makedirs(out_dir, exist_ok=True)

# 1. message.wav (Soft, sweet marimba/bell double-chime ~0.4s)
def gen_message(t, dur):
    env1 = math.exp(-t * 12.0)
    osc1 = math.sin(2.0 * math.pi * 784.0 * t) + 0.3 * math.sin(2.0 * math.pi * 1568.0 * t)
    s1 = osc1 * env1
    
    t2 = t - 0.12
    if t2 > 0:
        env2 = math.exp(-t2 * 10.0)
        osc2 = math.sin(2.0 * math.pi * 1046.5 * t2) + 0.25 * math.sin(2.0 * math.pi * 2093.0 * t2)
        s2 = osc2 * env2
    else:
        s2 = 0.0
    return (s1 * 0.4 + s2 * 0.4)

generate_wav(os.path.join(out_dir, "message.wav"), 0.5, gen_message)

# 2. notification.wav (Gentle pleasant cosmic chime ~0.6s)
def gen_notification(t, dur):
    # Tri-tone sparkle chord: E5, B5, E6
    chord = (
        0.3 * math.sin(2.0 * math.pi * 659.25 * t) * math.exp(-t * 6.0) +
        0.25 * math.sin(2.0 * math.pi * 987.77 * t) * math.exp(-t * 5.0) +
        0.2 * math.sin(2.0 * math.pi * 1318.5 * t) * math.exp(-t * 4.0)
    )
    return chord

generate_wav(os.path.join(out_dir, "notification.wav"), 0.7, gen_notification)

# 3. voice-call.wav (Vedic telephone repeating ringtone cycle ~2.8s)
def gen_voice_call(t, dur):
    # Standard ring cycle: 2 short bursts then silence (1.0s ring, 1.8s silence)
    burst1 = (0.0 <= t < 0.4)
    burst2 = (0.6 <= t < 1.0)
    if burst1 or burst2:
        local_t = t if burst1 else (t - 0.6)
        env = math.sin(math.pi * (local_t / 0.4)) ** 0.5
        # Dual frequency telephonic tones: 440Hz + 480Hz
        tone = (math.sin(2.0 * math.pi * 440.0 * t) + math.sin(2.0 * math.pi * 480.0 * t)) * 0.25
        return tone * env
    return 0.0

generate_wav(os.path.join(out_dir, "voice-call.wav"), 2.8, gen_voice_call)

# 4. video-call.wav (Distinct electronic uplifting melodic video ringtone ~3.0s)
def gen_video_call(t, dur):
    # 4 cascading cheerful melodic pulses every 0.3s (0.0, 0.3, 0.6, 0.9s), rest silence
    notes = [523.25, 659.25, 783.99, 1046.5] # C5, E5, G5, C6
    val = 0.0
    for idx, freq in enumerate(notes):
        start_t = idx * 0.28
        end_t = start_t + 0.35
        if start_t <= t < end_t:
            nt = t - start_t
            env = math.exp(-nt * 8.0) * math.sin(math.pi * (nt / 0.35))
            val += (math.sin(2.0 * math.pi * freq * t) + 0.2 * math.sin(2.0 * math.pi * freq * 2 * t)) * 0.35 * env
    return val

generate_wav(os.path.join(out_dir, "video-call.wav"), 3.0, gen_video_call)

# 5. consultation-request.wav (Short alert chime ~0.7s)
def gen_consultation_request(t, dur):
    # Two crisp rising tones (G5 -> D6)
    if t < 0.2:
        return 0.35 * math.sin(2.0 * math.pi * 783.99 * t) * math.exp(-t * 8.0)
    else:
        t2 = t - 0.2
        return 0.4 * math.sin(2.0 * math.pi * 1174.66 * t2) * math.exp(-t2 * 6.0)

generate_wav(os.path.join(out_dir, "consultation-request.wav"), 0.7, gen_consultation_request)

# 6. booking-confirmed.wav (Bright positive affirmation chime ~0.8s)
def gen_booking_confirmed(t, dur):
    # Major triad arpeggio: C5 -> E5 -> G5 -> C6
    notes = [523.25, 659.25, 783.99, 1046.5]
    val = 0.0
    for idx, freq in enumerate(notes):
        st = idx * 0.12
        if t >= st:
            nt = t - st
            env = math.exp(-nt * 7.0)
            val += 0.25 * math.sin(2.0 * math.pi * freq * nt) * env
    return val

generate_wav(os.path.join(out_dir, "booking-confirmed.wav"), 0.9, gen_booking_confirmed)

# 7. booking-cancelled.wav (Soft descending gentle alert sound ~0.7s)
def gen_booking_cancelled(t, dur):
    # Soft minor descent: G5 -> Eb5 -> C5
    notes = [783.99, 622.25, 523.25]
    val = 0.0
    for idx, freq in enumerate(notes):
        st = idx * 0.18
        if t >= st:
            nt = t - st
            env = math.exp(-nt * 8.0)
            val += 0.25 * (math.sin(2.0 * math.pi * freq * nt) + 0.15 * math.sin(2.0 * math.pi * (freq * 0.5) * nt)) * env
    return val

generate_wav(os.path.join(out_dir, "booking-cancelled.wav"), 0.8, gen_booking_cancelled)

# 8. reminder.wav (Gentle reminder warm bell ~0.7s)
def gen_reminder(t, dur):
    env = math.exp(-t * 5.0)
    # Warm bell tone 880Hz + 1320Hz harmonic
    return (0.3 * math.sin(2.0 * math.pi * 880.0 * t) + 0.15 * math.sin(2.0 * math.pi * 1320.0 * t)) * env

generate_wav(os.path.join(out_dir, "reminder.wav"), 0.8, gen_reminder)

# 9. message-sent.wav (Soft crisp ascending pop/whoosh ~0.25s)
def gen_message_sent(t, dur):
    env = math.exp(-t * 16.0)
    freq = 1046.5 + (1567.98 - 1046.5) * (t / dur)
    tone = math.sin(2.0 * math.pi * freq * t) * 0.25 * env
    return tone

generate_wav(os.path.join(out_dir, "message-sent.wav"), 0.25, gen_message_sent)

# 10. outgoing-call.wav (European/standard rhythmic ringback tone: 400Hz+450Hz ~3.0s)
def gen_outgoing_call(t, dur):
    if t < 1.0:
        env = math.sin(math.pi * (t / 1.0)) ** 0.3
        tone = (math.sin(2.0 * math.pi * 400.0 * t) + math.sin(2.0 * math.pi * 450.0 * t)) * 0.2
        return tone * env
    return 0.0

generate_wav(os.path.join(out_dir, "outgoing-call.wav"), 3.0, gen_outgoing_call)

print("All audio files generated successfully.")
