"""8 kHz PCMU speech detection. Input is always forwarded unchanged to GPT-Live."""
import struct

import webrtcvad


def decode_mulaw(value):
    value = (~value) & 255
    magnitude = (((value & 15) << 3) + 132) << ((value >> 4) & 7)
    return 132 - magnitude if value & 128 else magnitude - 132


PCM = tuple(struct.pack('<h', decode_mulaw(i)) for i in range(256))


class SpeechGate:
    """Require 120 ms speech to interrupt; reopen after 400 ms actual input silence.

    Uses media samples, not wall time, so a stalled microphone/network never
    masquerades as the user finishing. Partial frames survive packet boundaries.
    """
    def __init__(self, detector=None):
        self.detector = detector or webrtcvad.Vad(3)
        self.buffer = bytearray()
        self.active = False
        self.voiced = self.quiet = 0

    def feed(self, audio):
        self.buffer.extend(audio)
        started = False
        while len(self.buffer) >= 160:
            frame = bytes(self.buffer[:160])
            del self.buffer[:160]
            speech = self.detector.is_speech(b''.join(PCM[b] for b in frame), 8000)
            self.voiced = self.voiced + 20 if speech else 0
            self.quiet = 0 if speech else self.quiet + 20
            if not self.active and self.voiced >= 120:
                self.active = started = True
            elif self.active and self.quiet >= 400:
                self.active = False
        return started
