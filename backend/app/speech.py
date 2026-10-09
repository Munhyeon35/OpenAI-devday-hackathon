"""Explicit Korean readings for minute estimates sent to the voice model."""
DIGITS = '일이삼사오육칠팔구'


def korean_minutes(minutes):
    if not 1 <= minutes <= 360:
        raise ValueError('ETA must be between 1 and 360 minutes')
    parts = []
    for divisor, unit in ((100, '백'), (10, '십'), (1, '')):
        digit, minutes = divmod(minutes, divisor)
        if digit:
            parts.append(('' if digit == 1 and divisor > 1 else DIGITS[digit - 1]) + unit)
    return ''.join(parts) + ' 분'
