const TEN = 10n;
const POWERS_OF_TEN = [
    1n
];
function powerOfTen(exponent) {
    if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 2_000) {
        throw new RangeError("decimalExponentOutOfRange");
    }
    for(let index = POWERS_OF_TEN.length; index <= exponent; index += 1){
        POWERS_OF_TEN.push(POWERS_OF_TEN[index - 1] * TEN);
    }
    return POWERS_OF_TEN[exponent];
}
function absolute(value) {
    return value < 0n ? -value : value;
}
function greatestCommonDivisor(left, right) {
    let a = absolute(left);
    let b = absolute(right);
    while(b !== 0n){
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}
export class ExactDecimal {
    coefficient;
    scale;
    constructor(coefficient, scale = 0){
        if (!Number.isSafeInteger(scale) || scale < 0 || scale > 2_000) {
            throw new RangeError("decimalScaleOutOfRange");
        }
        let canonicalCoefficient = coefficient;
        let canonicalScale = scale;
        while(canonicalCoefficient !== 0n && canonicalScale > 0 && canonicalCoefficient % TEN === 0n){
            canonicalCoefficient /= TEN;
            canonicalScale -= 1;
        }
        this.coefficient = canonicalCoefficient;
        this.scale = canonicalCoefficient === 0n ? 0 : canonicalScale;
    }
    static parse(input) {
        if (typeof input !== "string" || input.length === 0 || input.length > 256 || input.trim() !== input) {
            throw new TypeError("invalidDecimal");
        }
        const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(input);
        if (!match) throw new TypeError("invalidDecimal");
        const integer = match[2] ?? "";
        const fraction = match[3] ?? match[4] ?? "";
        const exponent = match[5] === undefined ? 0 : Number(match[5]);
        if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 2_000) {
            throw new RangeError("decimalExponentOutOfRange");
        }
        const unsignedDigits = `${integer || "0"}${fraction}`.replace(/^0+(?=\d)/, "");
        let coefficient = BigInt(unsignedDigits || "0");
        if (match[1] === "-") coefficient = -coefficient;
        const scale = fraction.length - exponent;
        if (scale < 0) return new ExactDecimal(coefficient * powerOfTen(-scale), 0);
        return new ExactDecimal(coefficient, scale);
    }
    static from(value) {
        if (value instanceof ExactDecimal) return value;
        if (typeof value === "bigint") return new ExactDecimal(value);
        return ExactDecimal.parse(value);
    }
    static fromScaledInteger(value, scale) {
        return new ExactDecimal(value, scale);
    }
    add(otherInput) {
        const other = ExactDecimal.from(otherInput);
        const scale = Math.max(this.scale, other.scale);
        const left = this.coefficient * powerOfTen(scale - this.scale);
        const right = other.coefficient * powerOfTen(scale - other.scale);
        return new ExactDecimal(left + right, scale);
    }
    subtract(otherInput) {
        const other = ExactDecimal.from(otherInput);
        return this.add(new ExactDecimal(-other.coefficient, other.scale));
    }
    multiply(otherInput) {
        const other = ExactDecimal.from(otherInput);
        return new ExactDecimal(this.coefficient * other.coefficient, this.scale + other.scale);
    }
    divideByInteger(divisor) {
        if (divisor === 0n) throw new RangeError("divisionByZero");
        let numerator = this.coefficient;
        let denominator = divisor;
        if (denominator < 0n) {
            numerator = -numerator;
            denominator = -denominator;
        }
        const common = greatestCommonDivisor(numerator, denominator);
        numerator /= common;
        denominator /= common;
        let twos = 0;
        let fives = 0;
        while(denominator % 2n === 0n){
            denominator /= 2n;
            twos += 1;
        }
        while(denominator % 5n === 0n){
            denominator /= 5n;
            fives += 1;
        }
        if (denominator !== 1n) throw new RangeError("nonTerminatingDecimal");
        const addedScale = Math.max(twos, fives);
        if (twos < addedScale) numerator *= 2n ** BigInt(addedScale - twos);
        if (fives < addedScale) numerator *= 5n ** BigInt(addedScale - fives);
        return new ExactDecimal(numerator, this.scale + addedScale);
    }
    compare(otherInput) {
        const other = ExactDecimal.from(otherInput);
        const scale = Math.max(this.scale, other.scale);
        const left = this.coefficient * powerOfTen(scale - this.scale);
        const right = other.coefficient * powerOfTen(scale - other.scale);
        return left < right ? -1 : left > right ? 1 : 0;
    }
    isSwiftDecimalRepresentable() {
        if (this.coefficient === 0n) return true;
        const digits = absolute(this.coefficient).toString().length;
        const leastExponent = -this.scale;
        const greatestExponent = digits - this.scale - 1;
        return digits <= 38 && leastExponent >= -128 && greatestExponent <= 127;
    }
    toScaledIntegerExact(scale) {
        if (!Number.isSafeInteger(scale) || scale < 0) throw new RangeError("invalidScale");
        if (this.scale <= scale) return this.coefficient * powerOfTen(scale - this.scale);
        const divisor = powerOfTen(this.scale - scale);
        if (this.coefficient % divisor !== 0n) throw new RangeError("inexactScale");
        return this.coefficient / divisor;
    }
    toString(minimumFractionDigits = 0) {
        if (!Number.isSafeInteger(minimumFractionDigits) || minimumFractionDigits < 0) {
            throw new RangeError("invalidScale");
        }
        const negative = this.coefficient < 0n;
        const digits = absolute(this.coefficient).toString();
        const scale = Math.max(this.scale, minimumFractionDigits);
        const padded = digits.padStart(this.scale + 1, "0") + "0".repeat(scale - this.scale);
        const integerLength = padded.length - scale;
        const rendered = scale === 0 ? padded : `${padded.slice(0, integerLength)}.${padded.slice(integerLength)}`;
        return negative && this.coefficient !== 0n ? `-${rendered}` : rendered;
    }
    toJSON() {
        return this.toString();
    }
}
export function decimalTimesIntegerFraction(value, multiplier, divisor) {
    if (!Number.isSafeInteger(multiplier) || !Number.isSafeInteger(divisor) || divisor <= 0) {
        throw new RangeError("invalidFraction");
    }
    return {
        numerator: value.coefficient * BigInt(multiplier),
        denominator: powerOfTen(value.scale) * BigInt(divisor)
    };
}
export function multiplyFractions(left, right) {
    if (left.denominator === 0n || right.denominator === 0n) throw new RangeError("divisionByZero");
    return reduceFraction({
        numerator: left.numerator * right.numerator,
        denominator: left.denominator * right.denominator
    });
}
export function reduceFraction(input) {
    if (input.denominator === 0n) throw new RangeError("divisionByZero");
    let numerator = input.numerator;
    let denominator = input.denominator;
    if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
    }
    const common = greatestCommonDivisor(numerator, denominator);
    return {
        numerator: numerator / common,
        denominator: denominator / common
    };
}
export function roundFraction(input, scale, policy) {
    if (!Number.isSafeInteger(scale) || scale < 0 || input.denominator <= 0n) {
        throw new RangeError("invalidFraction");
    }
    const negative = input.numerator < 0n;
    const scaledNumerator = absolute(input.numerator) * powerOfTen(scale);
    let quotient = scaledNumerator / input.denominator;
    const remainder = scaledNumerator % input.denominator;
    const doubled = remainder * 2n;
    const shouldIncrement = doubled > input.denominator || doubled === input.denominator && (policy === "halfUp" || quotient % 2n !== 0n);
    if (shouldIncrement) quotient += 1n;
    return new ExactDecimal(negative ? -quotient : quotient, scale);
}
export function fractionToDecimalString(input, maximumFractionDigits = 38) {
    const fraction = reduceFraction(input);
    const negative = fraction.numerator < 0n;
    let numerator = absolute(fraction.numerator);
    const integer = numerator / fraction.denominator;
    let remainder = numerator % fraction.denominator;
    if (remainder === 0n) return `${negative ? "-" : ""}${integer}`;
    let digits = "";
    for(let index = 0; index < maximumFractionDigits && remainder !== 0n; index += 1){
        remainder *= TEN;
        digits += (remainder / fraction.denominator).toString();
        remainder %= fraction.denominator;
    }
    digits = digits.replace(/0+$/, "");
    return `${negative ? "-" : ""}${integer}.${digits || "0"}`;
}
export function fractionUnderflowsSwiftDecimal(input) {
    if (input.numerator === 0n) return false;
    return absolute(input.numerator) * powerOfTen(128) < absolute(input.denominator);
}


//# sourceURL=domain/decimal.ts