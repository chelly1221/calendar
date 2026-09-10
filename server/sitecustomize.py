"""Register Apple's URI extension before Radicale parses calendar resources."""
from vobject.base import registerBehavior
from vobject.behavior import Behavior
from vobject.icalendar import VEvent

# vobject 0.9.9 otherwise uses TextBehavior, which splits an unescaped URI comma
# and discards the longitude. URI values must pass through without text escaping.
registerBehavior(Behavior, "X-APPLE-STRUCTURED-LOCATION")
VEvent.knownChildren["X-APPLE-STRUCTURED-LOCATION"] = (0, None, None)
