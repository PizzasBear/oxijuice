import { Opt, Some, None } from "./option.js";

type Awaitable<T> = PromiseLike<T> | Awaited<T>;

export abstract class Stream<T> implements AsyncIterable<T>, AsyncIterator<T> {
    abstract [Symbol.asyncIterator](): AsyncIterator<T, unknown>;
    abstract next(): Promise<IteratorResult<T, unknown>>;
    abstract return?(value: unknown): Promise<IteratorResult<T, unknown>>;
    abstract throw?(e: unknown): Promise<IteratorResult<T, unknown>>;

    async optNext(): Promise<Opt<T>> {
        const res = await this.next();
        return res.done ? None : Some(res.value);
    }
    async nth(n: number): Promise<Opt<T>> {
        for (let i = 1; i < n; i++) {
            const res = await this.next();
            if (res.done) return None;
        }
        return this.optNext();
    }
    async all(this: Stream<boolean>): Promise<boolean> {
        let result = true;
        for await (const b of this) result &&= b;
        return result;
    }
    async any(this: Stream<boolean>): Promise<boolean> {
        let result = false;
        for await (const b of this) result ||= b;
        return result;
    }
    async sum(this: Stream<number>): Promise<number> {
        let sum = 0;
        for await (const x of this) sum += x;
        return sum;
    }
    async min(this: Stream<number>): Promise<number> {
        let min = 0;
        for await (const x of this) min = Math.min(x, min);
        return min;
    }
    async max(this: Stream<number>): Promise<number> {
        let max = 0;
        for await (const x of this) max = Math.max(x, max);
        return max;
    }
    async forEach(f: (x: T) => Awaitable<void>) {
        for await (const x of this) await f(x);
    }
    async fold<U>(init: U, f: (sum: U, x: T) => Awaitable<U>): Promise<U> {
        for await (const x of this) {
            init = await f(init, x);
        }
        return init;
    }
    async reduce(f: (sum: T, x: T) => Awaitable<T>): Promise<Opt<T>> {
        const res = await this.next();
        if (res.done) return None;

        let sum = res.value;
        for await (const x of this) {
            sum = await f(sum, x);
        }
        return Some(sum);
    }
    async find(f: (x: T, i: number) => Awaitable<boolean>): Promise<Opt<T>> {
        for (let i = 0; ; i++) {
            const res = await this.next();
            if (res.done) {
                return None;
            } else if (await f(res.value, i)) {
                return Some(res.value);
            }
        }
    }
    async findMap<U>(
        f: (x: T, i: number) => Awaitable<Opt<U>>,
    ): Promise<Opt<U>> {
        for (let i = 0; ; i++) {
            const res = await this.next();
            if (res.done) {
                return None;
            } else {
                const o = await f(res.value, i);
                if (o.some) return o;
            }
        }
    }

    take(cnt: number): TakeStream<T> {
        return new TakeStream(this, cnt);
    }
    enumerate(ctr: number = 0): EnumerateStream<T> {
        return new EnumerateStream(this, ctr);
    }
    await(): Stream<Awaited<T>> {
        return this.map(async (x: T): Promise<Awaited<T>> => await x);
    }
    map<U>(f: (x: T) => Awaitable<U>): MapStream<T, U> {
        return new MapStream(this, f);
    }
    filter(f: (x: T) => Awaitable<boolean>): FilterStream<T> {
        return new FilterStream(this, f);
    }
    filterMap<U>(f: (x: T) => Awaitable<Opt<U>>): FilterMapStream<T, U> {
        return new FilterMapStream(this, f);
    }
    zip<U extends any[]>(
        ...iters: ConstructorParameters<typeof ZipStream<U>>
    ): Stream<[T, ...U]> {
        return new ZipStream<[T, ...U]>(this, ...iters);
    }
    // collect(): T[];
    // collect<C>(c: { new (iter: AsyncIterable<T>): C }): C;
    // async collect<C>(c?: { new (iter: AsyncIterable<T>): C }): C | T[] {
    //     return c === undefined ? [...this] : new c(this);
    // }
}

class StreamWrapper<T> extends Stream<T> {
    iter: AsyncIterator<T, unknown> | Iterator<T, unknown>;

    constructor(a: AsyncIterable<T> & Partial<Iterable<T>>);
    constructor(a: Iterable<T> & { [Symbol.asyncIterator]?: undefined });
    constructor(
        a:
            | (AsyncIterable<T> & Partial<Iterable<T>>)
            | (Iterable<T> & { [Symbol.asyncIterator]?: undefined }),
    ) {
        super();
        this.iter = a[Symbol.asyncIterator]?.() ?? a[Symbol.iterator]!();
    }

    [Symbol.asyncIterator](): AsyncIterator<T, unknown> {
        return this;
    }
    async next(): Promise<IteratorResult<T, unknown>> {
        return await this.iter.next();
    }
    async return(value: unknown): Promise<IteratorResult<T, unknown>> {
        return (await this.iter.return?.(value)) ?? { done: true, value };
    }
    async throw(e: unknown): Promise<IteratorResult<T, unknown>> {
        return (await this.iter.throw?.(e)) ?? { done: true, value: undefined };
    }
}

class TakeStream<T> extends Stream<T> {
    iter: AsyncIterator<T, unknown>;
    cnt: number;

    constructor(a: AsyncIterable<T>, cnt: number) {
        super();
        this.iter = a[Symbol.asyncIterator]();
        this.cnt = 0 | cnt;
    }

    [Symbol.asyncIterator](): AsyncIterator<T, unknown> {
        return this;
    }
    async next(): Promise<IteratorResult<T, unknown>> {
        if (this.cnt <= 0) return { done: true, value: undefined };
        this.cnt--;
        return this.iter.next();
    }
    async return(value: unknown): Promise<IteratorResult<T, unknown>> {
        const res = (await this.iter.return?.(value)) ?? { done: true, value };
        res.done ||= this.cnt <= 0;
        return res;
    }
    async throw(e: unknown): Promise<IteratorResult<T, unknown>> {
        const res = (await this.iter.throw?.(e)) ?? {
            done: true,
            value: undefined,
        };
        res.done ||= this.cnt <= 0;
        return res;
    }
}

class EnumerateStream<T> extends Stream<[number, T]> {
    iter: AsyncIterator<T, unknown>;
    ctr: number;

    constructor(a: AsyncIterable<T>, ctr: number = 0) {
        super();
        this.iter = a[Symbol.asyncIterator]();
        this.ctr = ctr;
    }

    [Symbol.asyncIterator](): AsyncIterator<[number, T], unknown> {
        return this;
    }
    async next(): Promise<IteratorResult<[number, T], unknown>> {
        const res = await this.iter.next();
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
    async return(
        value: unknown,
    ): Promise<IteratorResult<[number, T], unknown>> {
        const res = (await this.iter.return?.(value)) ?? { done: true, value };
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
    async throw(e: unknown): Promise<IteratorResult<[number, T], unknown>> {
        const res = (await this.iter.throw?.(e)) ?? {
            done: true,
            value: undefined,
        };
        return res.done ? res : { value: [this.ctr++, res.value] };
    }
}

class MapStream<T, U> extends Stream<U> {
    iter: AsyncIterator<T, unknown>;
    f: (x: T) => Awaitable<U>;

    constructor(a: AsyncIterable<T>, f: (x: T) => Awaitable<U>) {
        super();
        this.iter = a[Symbol.asyncIterator]();
        this.f = f;
    }

    [Symbol.asyncIterator](): this {
        return this;
    }

    async next(): Promise<IteratorResult<U, unknown>> {
        const res = await this.iter.next();
        return res.done ? res : { value: await this.f(res.value) };
    }
    async return(value: unknown): Promise<IteratorResult<U, unknown>> {
        const res = (await this.iter.return?.(value)) ?? { done: true, value };
        return res.done ? res : { value: await this.f(res.value) };
    }
    async throw(e: unknown): Promise<IteratorResult<U, unknown>> {
        const res = (await this.iter.throw?.(e)) ?? {
            done: true,
            value: undefined,
        };
        return res.done ? res : { value: await this.f(res.value) };
    }
}

class FilterStream<T> extends Stream<T> {
    iter: AsyncIterator<T, unknown>;
    f: (x: T) => Awaitable<boolean>;

    constructor(a: AsyncIterable<T>, f: (x: T) => Awaitable<boolean>) {
        super();
        this.iter = a[Symbol.asyncIterator]();
        this.f = f;
    }

    [Symbol.asyncIterator](): this {
        return this;
    }

    async next(): Promise<IteratorResult<T, unknown>> {
        let res;
        do {
            res = await this.iter.next();
        } while (!res.done && (await this.f(res.value)));
        return res;
    }
    async return(value: unknown): Promise<IteratorResult<T, unknown>> {
        return this.iter.return?.(value) ?? { done: true, value };
    }
    async throw(e: unknown): Promise<IteratorResult<T, unknown>> {
        return this.iter.throw?.(e) ?? { done: true, value: undefined };
    }
}

class FilterMapStream<T, U> extends Stream<U> {
    iter: AsyncIterator<T, unknown>;
    f: (x: T) => Awaitable<Opt<U>>;

    constructor(a: AsyncIterable<T>, f: (x: T) => Awaitable<Opt<U>>) {
        super();
        this.iter = a[Symbol.asyncIterator]();
        this.f = f;
    }

    [Symbol.asyncIterator](): this {
        return this;
    }

    async next(): Promise<IteratorResult<U, unknown>> {
        while (true) {
            const res = await this.iter.next();
            if (res.done) {
                return res;
            } else {
                const opt = await this.f(res.value);
                if (opt.some) {
                    return { value: opt.value };
                }
            }
        }
    }
    async return(value: unknown): Promise<IteratorResult<U, unknown>> {
        const res = (await this.iter.return?.(value)) ?? { done: true, value };
        if (res.done) {
            return res;
        } else {
            const opt = await this.f(res.value);
            return opt.some ? { value: opt.value } : { done: true, value };
        }
    }
    async throw(e: unknown): Promise<IteratorResult<U, unknown>> {
        const res = (await this.iter.throw?.(e)) ?? {
            done: true,
            value: undefined,
        };
        if (res.done) {
            return res;
        } else {
            const opt = await this.f(res.value);
            return opt.some
                ? { value: opt.value }
                : { done: true, value: undefined };
        }
    }
}

class ZipStream<T extends any[]> extends Stream<T> {
    iters: { [I in keyof T]: AsyncIterator<T[I]> };

    constructor(...iters: { [I in keyof T]: AsyncIterable<T[I]> }) {
        super();
        this.iters = iters.map(iterable =>
            iterable[Symbol.asyncIterator](),
        ) as any;
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return this;
    }
    async next(): Promise<IteratorResult<T, unknown>> {
        const value = [];
        let done = false;
        for (const iter of this.iters) {
            const res = await iter.next();
            done = res.done || done;
            value.push(res.value);
        }
        return { value, done } as any;
    }
    async return(value: unknown): Promise<IteratorResult<T, unknown>> {
        for (const iter of this.iters) {
            await iter.return?.(value);
        }
        return { done: true, value };
    }
    async throw(e: unknown): Promise<IteratorResult<T, unknown>> {
        for (const iter of this.iters) {
            await iter.throw?.(e);
        }
        return { done: true, value: undefined };
    }
}

class OnceStream<T> extends Stream<T> {
    done: boolean;
    value: T;

    constructor(value: T) {
        super();
        this.done = false;
        this.value = value;
    }

    [Symbol.asyncIterator](): AsyncIterator<T, unknown> {
        return this;
    }
    async next(): Promise<IteratorResult<T, unknown>> {
        return { value: this.value, done: this.done };
    }
    async return(value: unknown): Promise<IteratorResult<T, unknown>> {
        return { value, done: true };
    }
    async throw(_e: unknown): Promise<IteratorResult<T, unknown>> {
        return { done: true, value: undefined };
    }
}

export const stream = <T>(
    ...args: ConstructorParameters<typeof StreamWrapper<T>>
): StreamWrapper<T> => {
    return new StreamWrapper(...args);
};
stream.Stream = Stream;
stream.zip = <T extends any[]>(
    ...iters: ConstructorParameters<typeof ZipStream<T>>
) => new ZipStream<T>(...iters);
stream.once = <T>(value: T) => new OnceStream(value);
stream.never = new (class extends Stream<never> {
    construtor() {}

    [Symbol.asyncIterator](): AsyncIterator<never, unknown> {
        return this;
    }
    async next(): Promise<IteratorResult<never, unknown>> {
        return { done: true, value: undefined };
    }
    return: undefined;
    throw: undefined;
})();
export default stream;
