export type Range<T extends any[], N extends number = never> = T extends [
    ...infer Rest,
    any,
]
    ? Range<Rest, N | Rest["length"]>
    : N;

type UniqueRec<T extends any[], O extends any[], N extends number> = T extends [
    ...infer Rest,
    any,
]
    ? [T[Rest["length"]]] extends [O[Exclude<N, Rest["length"]>]]
        ? false
        : UniqueRec<Rest, O, N>
    : true;

export type Unique<T extends any[]> = UniqueRec<T, T, Range<T>>;

export type Match<T, M extends [any, any][], D = never> = M extends [
    [infer K, infer V],
    ...infer Rest,
]
    ? [T] extends [K]
        ? V
        : Rest extends [any, any][]
        ? Match<T, Rest, D>
        : D
    : D;

export type If<O extends boolean, T, F, E = never> = Match<
    O,
    [[true, T], [false, F]],
    E
>;
