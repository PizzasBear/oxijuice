import iter, { Iter } from "./iter.js";
import { Opt, Some, None } from "./option.js";
import type { If } from "./utils.js";

export type Ok<T> = ResultPart<true, T, never>;
export type Err<E> = ResultPart<false, never, E>;
export type Result<T, E> = Ok<T> | Err<E>;

class ResultPart<O extends boolean, T, E> {
    /** A boolean that asserts that this value's either Ok or Err */
    readonly ok: If<O, true, false>;
    /** The value */
    readonly value: If<O, T, E>;

    /** INTERNAL DETAIL */
    constructor(ok: If<O, true, false>, value: If<O, T, E>) {
        this.ok = ok;
        this.value = value;
    }

    // /** Due to TypeScript safety limitations, this has to be a function */
    // setValue(value: If<O, T, E>) {
    //     this._value = value;
    // }
    // setOk<T, E>(this: Result<T, E>, value: T) {
    //     this._ok = true;
    //     this._value = value;
    // }
    // setErr<T, E>(this: Result<T, E>, value: E) {
    //     this._ok = false;
    //     this._value = value;
    // }

    okValue<T, E>(this: Result<T, E>): Opt<T> {
        return this.ok ? Some(this.value) : None;
    }

    errValue<T, E>(this: Result<T, E>): Opt<E> {
        return this.ok ? None : Some(this.value);
    }

    [Symbol.iterator]<T, E>(this: Result<T, E>): Iter<T> {
        return this.iter();
    }
    iter<T, E>(this: Result<T, E>): Iter<T> {
        return this.ok ? iter.once(this.value) : iter.never;
    }

    // cloneFrom(this: Result<T, E>, other: Result<T, E>) {
    //     this.ok = other.ok;
    //     this.value = other.value;
    // }

    // clone(this: Result<T, E>): Result<T, E> {
    //     /** @ts-ignore */
    //     return new ResultPart(this.ok, this.value);
    //     // // TypeScript friendly implementation
    //     // return this.ok ? Ok(this.value) : Err(this.value);
    // }

    async await<T, E>(this: Result<T, E>): Promise<Result<Awaited<T>, E>> {
        return this.ok ? Ok(await this.value) : this;
    }

    async awaitErr<T, E>(this: Result<T, E>): Promise<Result<T, Awaited<E>>> {
        return this.ok ? this : Err(await this.value);
    }

    async awaitBoth<T, E>(
        this: Result<T, E>,
    ): Promise<Result<Awaited<T>, Awaited<E>>> {
        /** @ts-ignore */
        return new ResultPart(this.ok, await this.value);

        // // TypeScript friendly implementation
        // return this.ok ? Ok(await this.value) : Err(await this.value);
    }

    and<T, E, U>(
        this: Result<T, E>,
        r: Result<U, E> | ((x: T) => Result<U, E>),
    ): Result<U, E> {
        return !this.ok ? this : typeof r === "function" ? r(this.value) : r;
    }

    or<T, E, F>(
        this: Result<T, E>,
        r: Result<T, F> | ((e: E) => Result<T, F>),
    ): Result<T, F> {
        return this.ok ? this : typeof r === "function" ? r(this.value) : r;
    }

    map<T, U>(this: Ok<T>, f: (x: T) => U): Ok<U>;
    map<E>(this: Err<E>, f: (x: any) => unknown): Err<E>;
    map<T, E, U>(this: Result<T, E>, f: (x: T) => U): Result<U, E>;
    map<T, E, U>(this: Result<T, E>, f: (x: T) => U): Result<U, E> {
        return this.ok ? Ok(f(this.value)) : this;
    }

    mapErr<T>(this: Ok<T>, f: (x: any) => unknown): Ok<T>;
    mapErr<E, F>(this: Err<E>, f: (x: E) => F): Err<F>;
    mapErr<T, E, F>(this: Result<T, E>, f: (x: E) => F): Result<T, F>;
    mapErr<T, E, F>(this: Result<T, E>, f: (x: E) => F): Result<T, F> {
        return this.ok ? this : Err(f(this.value));
    }

    /** UNSOUND: uses `as` internally */
    castMap<T, E, U>(this: Result<T, E>): Result<U, E> {
        return this as Result<U, E>;
    }

    /** UNSOUND: uses `as` internally */
    castMapErr<T, E, U>(this: Result<T, E>): Result<T, U> {
        return this as Result<T, U>;
    }

    collapse<T>(this: Result<T, T> | ResultPart<boolean, T, T>): T {
        return this.value;
    }

    /** Throws the error, may be used like `.unwrap()` in Rust */
    throw<T, E>(this: Result<T, E>): T {
        if (this.ok) return this.value;
        else throw this.value;
    }

    /** Throws an `Error` if `this` is `Err` */
    unwrap<T, E>(this: Result<T, E>): T;
    /** Throws `Error(msg)` if `this` is `Err` */
    unwrap<T, E>(this: Result<T, E>, msg: string): T;
    /** Throws `f(this.value)` if `this` is `Err` */
    unwrap<T, E>(this: Result<T, E>, f: (err: E) => unknown): T;
    unwrap<T, E>(
        this: Result<T, E>,
        msg: string | ((err: E) => unknown) = "Failed to unwrap Result",
    ): T {
        if (this.ok) return this.value;
        else throw typeof msg === "function" ? msg(this.value) : new Error(msg);
    }

    /** Throws an `Error` if `this` is `Ok` */
    unwrapErr<T, E>(this: Result<T, E>): E;
    /** Throws `Error(msg)` if `this` is `Ok` */
    unwrapErr<T, E>(this: Result<T, E>, msg: string): E;
    /** Throws `f(this.value)` if `this` is `Ok` */
    unwrapErr<T, E>(this: Result<T, E>, msg: (value: T) => unknown): E;
    unwrapErr<T, E>(
        this: Result<T, E>,
        msg: string | ((value: T) => unknown) = "Failed to unwrap Result",
    ): E {
        if (!this.ok) return this.value;
        else throw typeof msg === "function" ? msg(this.value) : new Error(msg);
    }

    /** UNSOUND: uses `as` internally */
    unwrapUnchecked<T, E>(this: Result<T, E>): T {
        return this.value as T;
    }

    /** UNSOUND: uses `as` internally */
    unwrapErrUnchecked<T, E>(this: Result<T, E>): E {
        return this.value as E;
    }

    unwrapOr<T, E>(this: Result<T, E>, def: T): T {
        return this.ok ? this.value : def;
    }

    unwrapOrElse<T, E>(this: Result<T, E>, def: (x: E) => T): T {
        return this.ok ? this.value : def(this.value);
    }

    mapOr<T, E, U>(this: Result<T, E>, def: U, f: (x: T) => U): U {
        return this.ok ? f(this.value) : def;
    }

    mapOrElse<T, E, U>(
        this: Result<T, E>,
        def: (x: E) => U,
        f: (x: T) => U,
    ): U {
        return this.ok ? f(this.value) : def(this.value);
    }

    transpose<T, E>(this: Result<Opt<T>, E>): Opt<Result<T, E>> {
        return this.ok ? this.value.map(Ok) : Some(this);
    }
}

export function Ok<T>(value: T): Ok<T> {
    return new ResultPart<true, T, never>(true, value);
}
export function Err<E>(value: E): Err<E> {
    return new ResultPart<false, never, E>(false, value);
}

function catch_<T>(f: () => T): Result<T, unknown>;
function catch_<T, E>(f: () => T, isE: (e: unknown) => e is E): Result<T, E>;
function catch_<T, E = unknown>(
    f: () => T,
    isE?: (e: unknown) => e is E,
): Result<T, E> {
    try {
        return Ok(f());
    } catch (err) {
        if (isE?.(err) ?? true) return Err(err as E);
        else throw err;
    }
}

async function asyncCatch<T>(
    f: PromiseLike<T> | (() => PromiseLike<T>),
): Promise<Result<T, unknown>>;
async function asyncCatch<T, E>(
    f: PromiseLike<T> | (() => PromiseLike<T>),
    isE: (e: unknown) => e is E,
): Promise<Result<T, E>>;
async function asyncCatch<T, E = unknown>(
    f: PromiseLike<T> | (() => PromiseLike<T>),
    isE?: (e: unknown) => e is E,
): Promise<Result<T, E>> {
    try {
        return Ok(await (typeof f === "function" ? f() : f));
    } catch (err) {
        if (isE?.(err) ?? true) return Err(err as E);
        else throw err;
    }
}

export const Result = {
    Ok,
    Err,
    catch: catch_,
    asyncCatch,
} as const;
export default Result;
