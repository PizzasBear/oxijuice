import iter, { Iter } from "./iter.js";
import { Result, Ok, Err } from "./result.js";
import type { If } from "./utils.js";

export type Some<T> = OptPart<true, T>;
export type None = OptPart<false, never>;
export type Opt<T> = Some<T> | None;

class OptPart<O extends boolean, T> {
    readonly some: If<O, true, false>;
    readonly value: If<O, T, undefined>;

    constructor(ok: If<O, true, false>, value: If<O, T, undefined>) {
        this.some = ok;
        this.value = value;
    }

    // /** Due to TypeScript safety limitations, this has to be a function */
    // setValue(value: If<O, T, undefined>) {
    //     this._value = value;
    // }
    // setSome<T>(this: Option<T>, value: T) {
    //     this._some = true;
    //     this._value = value;
    // }
    // setNone<T>(this: Option<T>) {
    //     this._some = false;
    //     this._value = undefined;
    // }
    // cloneFrom(this: Option<T>, other: Option<T>) {
    //     this._some = other._some;
    //     this._value = other._value;
    // }

    clone<T>(this: Opt<T>): Opt<T> {
        /** @ts-ignore */
        return new OptPart(this.some, this.value);
        // // TypeScript friendly implementation
        // return this._some ? Some(this._value) : None();
    }

    [Symbol.iterator]<T>(this: Opt<T>): Iter<T> {
        return this.iter();
    }
    iter<T>(this: Opt<T>): Iter<T> {
        return this.some ? iter.once(this.value) : iter.never;
    }

    async await<T>(this: Opt<Promise<T>>): Promise<Opt<T>> {
        return this.some ? Some(await this.value) : this;
    }

    and<T, U>(this: Opt<T>, o: Opt<U> | ((x: T) => Opt<U>)): Opt<U> {
        return !this.some ? this : typeof o === "function" ? o(this.value) : o;
    }

    or<T>(this: Opt<T>, o: Opt<T> | (() => Opt<T>)): Opt<T> {
        return this.some ? this : typeof o === "function" ? o() : o;
    }

    xor<T>(this: Opt<T>, res: Opt<T>): Opt<T> {
        return res.some ? (this.some ? None : res) : this;
    }

    filter<T>(this: Opt<T>, predicate: (x: T) => boolean): Opt<T> {
        return this.some && predicate(this.value) ? this : None;
    }

    map<T, U>(this: Opt<T>, f: (x: T) => U): Opt<U> {
        return this.some ? Some(f(this.value)) : this;
    }

    /** UNSOUND: uses `as` internally */
    castMap<T, U>(this: Opt<T>): Opt<U> {
        return this as Opt<U>;
    }

    /** Throws the error, may be used like `.unwrap()` in Rust */
    throw<T>(this: Opt<T>): T {
        if (this.some) {
            return this.value;
        } else {
            throw new Error("Unwrapping option failed");
        }
    }

    /** UNSOUND: uses `as` internally */
    unwrapUnchecked<T>(this: Opt<T>): T {
        return this.value as T;
    }

    unwrap<T>(this: Opt<T>, msg: string = "Failed to unwrap Opt"): T {
        if (this.some) return this.value;
        else throw new Error(msg);
    }

    unwrapOr<T>(this: Opt<T>, def: T): T {
        return this.some ? this.value : def;
    }

    unwrapOrElse<T>(this: Opt<T>, def: () => T): T {
        return this.some ? this.value : def();
    }

    mapOr<T, U>(this: Opt<T>, def: U, f: (x: T) => U): U {
        return this.some ? f(this.value) : def;
    }

    mapOrElse<T, U>(this: Opt<T>, def: () => U, f: (x: T) => U): U {
        return this.some ? f(this.value) : def();
    }

    okOr<T, E>(this: Opt<T>, err: E): Result<T, E> {
        return this.some ? Ok(this.value) : Err(err);
    }

    okOrElse<T, E>(this: Opt<T>, err: () => E): Result<T, E> {
        return this.some ? Ok(this.value) : Err(err());
    }

    transpose<T, E>(this: Opt<Result<T, E>>): Result<Opt<T>, E> {
        return this.some ? this.value.map(Some) : Ok(None);
    }
}

export function Some<T>(value: T): Some<T> {
    return new OptPart(true, value);
}
export const None: None = new OptPart<false, never>(false, undefined);

export const Opt = {
    Some,
    None,
    zip<T extends any[]>(...opts: { [I in keyof T]: Opt<T[I]> }): Opt<T> {
        const a = [];
        for (const o of opts) {
            if (!o.some) return None;
            a.push(o.value);
        }
        return Some(a as T);
    },
} as const;
export default Opt;
