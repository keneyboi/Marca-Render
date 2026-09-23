class CustomEncryption {
    static getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static encrypt(s) {
        const encryptSize = (s.length * 3) + 1;
        const encrypted = new Array(encryptSize).fill('d');
        let count = 0;
        let inc = 0;
        let dec = 0;

        const mode = this.getRandomInt(0, 2);
        if (mode === 0) {
            encrypted[encryptSize - 1] = '*';
            inc = 41; dec = 33;
        } else if (mode === 1) {
            encrypted[encryptSize - 1] = '&';
            inc = 24; dec = 11;
        } else {
            encrypted[encryptSize - 1] = ':';
            inc = 36; dec = 29;
        }

        for (let i = 0; i < encryptSize - 1; i++) {
            if (Math.floor(i / 3) === count) {
                let c = s.charCodeAt(Math.floor(i / 3));
                if (c >= 77) {
                    c -= dec;
                    encrypted[i] = String.fromCharCode(c);
                    const ch = this.getRandomInt(77, 126);
                    encrypted[i + 1] = String.fromCharCode(ch);
                    i++;
                } else {
                    c += inc;
                    encrypted[i] = String.fromCharCode(c);
                    const ch = this.getRandomInt(33, 76);
                    encrypted[i + 1] = String.fromCharCode(ch);
                    i++;
                }
                count++;
            } else {
                const ch = this.getRandomInt(33, 126);
                encrypted[i] = String.fromCharCode(ch);
            }
        }
        return encrypted.join('');
    }

    static decrypt(s) {
        const decryptSize = s.length;
        if (decryptSize === 0) return '';
        
        let count = 0;
        const decrypted = new Array(Math.floor(decryptSize / 3));
        const key = s[decryptSize - 1];
        let inc = 0;
        let dec = 0;

        if (key === '*') {
            inc = 41; dec = 33;
        } else if (key === '&') {
            inc = 24; dec = 11;
        } else {
            inc = 36; dec = 29;
        }

        for (let i = 0; i < decryptSize - 1; i++) {
            if (Math.floor(i / 3) === count) {
                let c = s.charCodeAt(i);
                if (s.charCodeAt(i + 1) >= 77) {
                    c += dec;
                    decrypted[count++] = String.fromCharCode(c);
                } else {
                    c -= inc;
                    decrypted[count++] = String.fromCharCode(c);
                }
            }
        }
        return decrypted.join('');
    }
}