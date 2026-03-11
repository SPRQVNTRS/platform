---
"@sprqvntrs/wp-rest": minor
---

feat(wp-rest): support offer_type as array with OfferType union and normalizeOfferType helper

Upstream WordPress API changed `offer_type` from a string to an array of strings. Updated `WpOfferResponse.acf.offer_type` to `OfferType[] | OfferType`, added a typed `OfferType` union with all known values, and exported a `normalizeOfferType()` utility for safely coercing legacy string responses into arrays.
