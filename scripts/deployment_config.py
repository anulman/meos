# SPDX-License-Identifier: Apache-2.0
"""Validation for trusted operator inputs, never request-derived identity."""
import re
from urllib.parse import urlsplit

def origin(value):
    assert isinstance(value, str) and len(value) <= 300
    parsed = urlsplit(value)
    assert parsed.scheme == 'https' and not parsed.username and not parsed.password
    assert not parsed.path and not parsed.query and not parsed.fragment
    assert parsed.hostname and re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)*', parsed.hostname)
    assert parsed.port is None and value == 'https://' + parsed.hostname, 'Use an HTTPS hostname without an explicit port'
    return value

def issuer(value):
    assert isinstance(value, str) and re.fullmatch(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.cloudflareaccess\.com', value)
    return value

def email(value):
    assert isinstance(value, str) and len(value) <= 254 and re.fullmatch(r'[^\s@]+@[^\s@]+', value)
    return value
