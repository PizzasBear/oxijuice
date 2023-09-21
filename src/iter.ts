import { Opt, Some, None } from "./option.js";
import { Stream, stream } from "./stream.js";

export abstract class Iter<T> implements Iterable<T>, Iterator<T> {
    abstract [Symbol.iterator](): Iterator<T, unknown>;
    abstract next(): IteratorResult<T, unknown>;
    abstract return?(value: unknown): IteratorResult<T, unknown>;
    abstract throw?(e: unknown): IteratorResult<T, unknown>;

    optNext(): Opt<T> {
        const res = this.next();
        return res.done ? None : Some(res.value);
    }
    nth(n: number): Opt<T> {
        for (let i = 1; i < n; i++) {
            const res = this.next();
            if (res.done) return None;
        }
        return this.optNext();
    }
    all(this: Iter<boolean>): boolean {
        let result = true;
        for (const b of this) result &&= b;
        return result;
    }
    any(this: Iter<boolean>): boolean {
        let result = false;
        for (const b of this) result ||= b;
        return result;
    }
    sum(this: Iter<number>): number {
        let sum = 0;
        for (const x of this) sum += x;
        return sum;
    }
    /** Performs string join */
    join<T>(this: Iter<T>, sep: string): string {
        const res = this.next();
        if (res.done) return "";

        let sum = `${res.value}`;
        for (const x of this) {
            sum += sep;
            sum += x;
        }
        return sum;
    }
    min(this: Iter<number>): number {
        let min = 0;
        for (const x of this) min = Math.min(x, min);
        return min;
    }
    max(this: Iter<number>): number {
        let max = 0;
        for (const x of this) max = Math.max(x, max);
        return max;
    }
    forEach(f: (x: T) => void) {
        for (const x of this) f(x);
    }
    fold<U>(init: U, f: (sum: U, x: T) => U): U {
        for (const x of this) {
            init = f(init, x);
        }
        return init;
    }
    reduce(f: (sum: T, x: T) => T): Opt<T> {
        const res = this.next();
        if (res.done) return None;

        let sum = res.value;
        for (const x of this) {
            sum = f(sum, x);
        }
        return Some(sum);
    }
    find(f: (x: T, i: number) => boolean): Opt<T> {
        for (let i = 0; ; i++) {
            const res = this.next();
            if (res.done) {
                return None;
            } else if (f(res.value, i)) {
                return Some(res.value);
            }
        }
    }
    findMap<U>(f: (x: T, i: number) => Opt<U>): Opt<U> {
        for (let i = 0; ; i++) {
            const res = this.next();
            if (res.done) {
                return None;
            } else {
                const o = f(res.value, i);
                if (o.some) return o;
            }
        }
    }

    take(cnt: number): TakeIter<T> {
        return new TakeIter(this, cnt);
    }
    enumerate(ctr: number = 0): EnumerateIter<T> {
        return new EnumerateIter(this, ctr);
    }
    map<U>(f: (x: T) => U): MapIter<T, U> {
        return new MapIter(this, f);
    }
    filter(f: (x: T) => boolean): FilterIter<T> {
        return new FilterIter(this, f);
    }
    filterMap<U>(f: (x: T) => Opt<U>): FilterMapIter<T, U> {
        return new FilterMapIter(this, f);
    }
    zip<U extends any[]>(
        ...iters: ConstructorParameters<typeof ZipIter<U>>
    ): Iter<[T, ...U]> {
        return new ZipIter<[T, ...U]>(this, ...iters);
    }
    collect(): T[];
    collect<C>(c: { new (iter: Iter<T>): C }): C;
    collect<C>(c?: { new (iter: Iter<T>): C }): C | T[] {
        return c === undefined ? [...this] : new c(this);
    }
    stream(): Stream<T> {
        return stream(this);
    }
}

class IterWrapper<T> extends Iter<T> {
    iter: Iterator<T, unknown>;

    constructor(a: Iterable<T>) {
        super();
        this.iter = a[Symbol.iterator]();
    }

    [Symbol.iterator](): Iterator<T, unknown> {
        return this.iter;
    }
    next(): IteratorResult<T, unknown> {
        return this.iter.next();
    }
    return(value: unknown): IteratorResult<T, unknown> {
        return this.iter.return?.(value) ?? { done: true, value };
    }
    throw(e: unknown): IteratorResult<T, unknown> {
        return this.iter.throw?.(e) ?? { done: true, value: undefined };
    }
}

class TakeIter<T> extends Iter<T> {
    iter: Iterator<T, unknown>;
    cnt: number;

    constructor(a: Iterable<T>, cnt: number) {
        super();
        this.iter = a[Symbol.iterator]();
        this.cnt = Math.max(0, 0 | cnt);
    }

    [Symbol.iterator](): Iterator<T, unknown> {
        return this;
    }
    next(): IteratorResult<T, unknown> {
        if (this.cnt <= 0) return { done: true, value: undefined };
        this.cnt--;
        return this.iter.next();
    }
    return(value: unknown): IteratorResult<T, unknown> {
        const res = this.iter.return?.(value) ?? { done: true, value };
        res.done ||= this.cnt <= 0;
        return res;
    }
    throw(e: unknown): IteratorResult<T, unknown> {
        const res = this.iter.throw?.(e) ?? { done: true, value: undefined };
        res.done ||= this.cnt <= 0;
        return res;
    }
}

class EnumerateIter<T> extends Iter<[number, T]> {
    iter: Iterator<T, unknown>;
    ctr: number;

    constructor(a: Iterable<T>, ctr: number = 0) {
        super();
        this.iter = a[Symbol.iterator]();
        this.ctr = ctr;
    }

    [Symbol.iterator](): Iterator<[number, T], unknown> {
        return this;
    }
    next(): IteratorResult<[number, T], unknown> {
        const res = this.iter.next();
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
    return(value: unknown): IteratorResult<[number, T], unknown> {
        const res = this.iter.return?.(value) ?? { done: true, value };
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
    throw(e: unknown): IteratorResult<[number, T], unknown> {
        const res = this.iter.throw?.(e) ?? { done: true, value: undefined };
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
}

class MapIter<T, U> extends Iter<U> {
    iter: Iterator<T, unknown>;
    f: (x: T) => U;

    constructor(a: Iterable<T>, f: (x: T) => U) {
        super();
        this.iter = a[Symbol.iterator]();
        this.f = f;
    }

    [Symbol.iterator](): this {
        return this;
    }

    next(): IteratorResult<U, unknown> {
        const res = this.iter.next();
        return res.done ? res : { value: this.f(res.value) };
    }
    return(value: unknown): IteratorResult<U, unknown> {
        const res = this.iter.return?.(value) ?? { done: true, value };
        return res.done ? res : { value: this.f(res.value) };
    }
    throw(e: unknown): IteratorResult<U, unknown> {
        const res = this.iter.throw?.(e) ?? { done: true, value: undefined };
        return res.done ? res : { value: this.f(res.value) };
    }
}

class FilterIter<T> extends Iter<T> {
    iter: Iterator<T, unknown>;
    f: (x: T) => boolean;

    constructor(a: Iterable<T>, f: (x: T) => boolean) {
        super();
        this.iter = a[Symbol.iterator]();
        this.f = f;
    }

    [Symbol.iterator](): this {
        return this;
    }

    next(): IteratorResult<T, unknown> {
        let res;
        do {
            res = this.iter.next();
        } while (!res.done && this.f(res.value));
        return res;
    }
    return(value: unknown): IteratorResult<T, unknown> {
        return this.iter.return?.(value) ?? { done: true, value };
    }
    throw(e: unknown): IteratorResult<T, unknown> {
        return this.iter.throw?.(e) ?? { done: true, value: undefined };
    }
}

class FilterMapIter<T, U> extends Iter<U> {
    iter: Iterator<T, unknown>;
    f: (x: T) => Opt<U>;

    constructor(a: Iterable<T>, f: (x: T) => Opt<U>) {
        super();
        this.iter = a[Symbol.iterator]();
        this.f = f;
    }

    [Symbol.iterator](): this {
        return this;
    }

    next(): IteratorResult<U, unknown> {
        while (true) {
            const res = this.iter.next();
            if (res.done) {
                return res;
            } else {
                const opt = this.f(res.value);
                if (opt.some) {
                    return { value: opt.value };
                }
            }
        }
    }
    return(value: unknown): IteratorResult<U, unknown> {
        const res = this.iter.return?.(value) ?? { done: true, value };
        if (res.done) {
            return res;
        } else {
            const opt = this.f(res.value);
            return opt.some ? { value: opt.value } : { done: true, value };
        }
    }
    throw(e: unknown): IteratorResult<U, unknown> {
        const res = this.iter.throw?.(e) ?? { done: true, value: undefined };
        if (res.done) {
            return res;
        } else {
            const opt = this.f(res.value);
            return opt.some
                ? { value: opt.value }
                : { done: true, value: undefined };
        }
    }
}

class ZipIter<T extends any[]> extends Iter<T> {
    iters: { [I in keyof T]: Iterator<T[I]> };

    constructor(...iters: { [I in keyof T]: Iterable<T[I]> }) {
        super();
        this.iters = iters.map(iterable => iterable[Symbol.iterator]()) as any;
    }

    [Symbol.iterator](): Iterator<T> {
        return this;
    }
    next(): IteratorResult<T, unknown> {
        const value = [];
        let done = false;
        for (const iter of this.iters) {
            const res = iter.next();
            done = res.done || done;
            value.push(res.value);
        }
        return { value, done } as any;
    }
    return(value: unknown): IteratorResult<T, unknown> {
        for (const iter of this.iters) {
            iter.return?.(value);
        }
        return { done: true, value };
    }
    throw(e: unknown): IteratorResult<T, unknown> {
        for (const iter of this.iters) {
            iter.throw?.(e);
        }
        return { done: true, value: undefined };
    }
}

class Range extends Iter<number> {
    curr: number;
    end: number;
    step: number;

    constructor(end: number);
    constructor(begin: number, end?: number);
    constructor(begin: number, end?: number, step?: number);
    constructor(begin: number, end?: number, step?: number) {
        super();
        this.curr = end === undefined ? 0 : begin;
        this.end = end ?? begin;
        this.step = step ?? (this.curr <= this.end ? 1 : -1);
    }

    static inclusive(end: number): Range;
    static inclusive(begin: number, end?: number): Range;
    static inclusive(begin: number, end?: number, step?: number): Range;
    static inclusive(begin: number, end?: number, step?: number): Range {
        const r = new Range(begin, end, step);
        r.end += r.step;
        return r;
    }

    [Symbol.iterator](): Iterator<number, unknown> {
        return this;
    }
    next(): IteratorResult<number, unknown> {
        this.curr += this.step;
        return {
            value: this.curr,
            done: this.step < 0 === this.curr < this.end,
        };
    }
    return: undefined;
    throw: undefined;
}

class OnceIter<T> extends Iter<T> {
    done: boolean;
    value: T;

    constructor(value: T) {
        super();
        this.done = false;
        this.value = value;
    }

    [Symbol.iterator](): Iterator<T, unknown> {
        return this;
    }
    next(): IteratorResult<T, unknown> {
        return { value: this.value, done: this.done };
    }
    return: undefined;
    throw: undefined;
}

/** Exclusive Range */
export function range(end: number): Range;
export function range(begin: number, end?: number): Range;
export function range(begin: number, end?: number, step?: number): Range;
export function range(begin: number, end?: number, step?: number): Range {
    return new Range(begin, end, step);
}

/** Inclusive Range */
export function irange(end: number): Range;
export function irange(begin: number, end?: number): Range;
export function irange(begin: number, end?: number, step?: number): Range;
export function irange(begin: number, end?: number, step?: number): Range {
    return Range.inclusive(begin, end, step);
}

export const iter = <T>(a: Iterable<T>): IterWrapper<T> => {
    return new IterWrapper(a);
};
iter.Iter = Iter;
iter.zip = <T extends any[]>(
    ...iters: ConstructorParameters<typeof ZipIter<T>>
) => new ZipIter<T>(...iters);
iter.once = <T>(value: T) => new OnceIter(value);
iter.range = range;
iter.irange = irange;
iter.never = new (class extends Iter<any> {
    construtor() {}

    [Symbol.iterator](): Iterator<never, unknown> {
        return this;
    }
    next(): IteratorResult<never, unknown> {
        return { done: true, value: undefined };
    }
    return: undefined;
    throw: undefined;
})() as Iter<any>;
export default iter;
