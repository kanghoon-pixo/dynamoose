"use strict";
module.exports = (saveUnknown, checkKey, settings = { "splitString": ".", "prefixesDisallowed": true }) => {
    if (Array.isArray(saveUnknown)) {
        return Boolean(saveUnknown.find((key) => {
            const keyParts = key.split(settings.splitString);
            const checkKeyParts = checkKey.split(settings.splitString);
            let index = 0, keyPart = keyParts[0];
            for (let i = 0; i < checkKeyParts.length; i++) {
                if (keyPart === "**") {
                    return true;
                }
                if (keyPart !== "*" && checkKeyParts[i] !== keyPart) {
                    return false;
                }
                keyPart = keyParts[++index];
            }
            if (!settings.prefixesDisallowed && keyPart) {
                return false;
            }
            return true;
        }));
    }
    else {
        return saveUnknown;
    }
};
//# sourceMappingURL=wildcard_allowed_check.js.map