import {BehaviorSubject, combineLatest, isObservable, Observable, Subject, Subscription} from 'rxjs';
import {catchError, distinctUntilChanged, filter, map, take, takeUntil, tap} from 'rxjs/operators';

export class Resource<T> {
    /**
     * Current state of the resource
     */
    public readonly data$: BehaviorSubject<ResourceState<T>>;

    get value$(): Observable<T | undefined> {
        return this.data$
            .pipe(
                map(d => d.value),
                distinctUntilChanged(),
                takeUntil(this.destroy$),
            );
    }

    /**
     * false until first value came to the resource. Use this as first time loading indicator.
     */
    get initialized$(): Observable<boolean> {
        return this.data$
            .pipe(
                map(d => d.initialized),
                distinctUntilChanged(),
                takeUntil(this.destroy$),
            );
    }

    /**
     * True if resource (or one of dependant resources) is in loading state.
     * Use it as refreshing data loading indicator.
     * For initial loading indication use `initialized` field.
     */
    get loading$(): Observable<boolean> {
        return this.data$
            .pipe(
                map(d => d.loading),
                distinctUntilChanged(),
                takeUntil(this.destroy$),
            );
    }

    /**
     * An error occurred during resource initialization.
     */
    get error$(): Observable<any | undefined> {
        return this.data$
            .pipe(
                map(d => d.error),
                distinctUntilChanged(),
                takeUntil(this.destroy$),
            );
    }

    /**
     * Resources that directly depend on this resource.
     */
    readonly dependants: Array<Resource<any>> = [];

    /**
     * The resources that this resource depends on.
     */
    readonly dependencies: Array<Resource<any>>;

    /**
     * Destruction guard. Emits once and then completes.
     */
    readonly destroy$ = new Subject<void>();

    private readonly reInitOnDependencyChange: boolean;

    private readonly initFunction: ResourceConfig<T>['init'] | undefined;

    private reInitObservableSubscription?: Subscription;
    private reInitLoadingObservableSubscription?: Subscription;

    private isDependencyLoading: boolean = false;
    private isResourceLoading: boolean = false;

    private readonly config: ResourceConfig<T>;

    private initAttemptCounter = 0;

    constructor(config?: ResourceConfig<T>) {
        config = config || {};
        this.config = config;

        this.data$ = new BehaviorSubject<ResourceState<T>>({
            initialized: false,
            initializing: false,
            loading: false,
            value: config.defaultValue,
        });

        this.reInitOnDependencyChange = config.reInitOnDependencyChange !== false;

        this.initFunction = config.init;

        this.dependencies = config.dependencies || [];
        this.dependencies.forEach(dep => dep.dependants.push(this));
    }

    /**
     * Destroy the resource. You should use this function to prevent memory leaks.
     */
    destroy() {
        this.dependencies.forEach(dep => {
            const ind = dep.dependants.indexOf(this);
            if (ind >= 0) {
                dep.dependants.splice(ind, 1);
            }
        });
        this.dependants.forEach(dep => {
            const ind = dep.dependencies.indexOf(this);
            if (ind >= 0) {
                dep.dependencies.splice(ind, 1);
            }
        });

        this.data$.complete();
        this.destroy$.next();
        this.destroy$.complete();
        this.reInitObservableSubscription?.unsubscribe();
        this.reInitLoadingObservableSubscription?.unsubscribe();
    }

    /**
     * Set resource value. This action will set this resource to initialized state.
     * @param value
     */
    setValue(value: T) {
        this.data$.next({
            ...this.data$.getValue(),
            initialized: true,
            initializing: false,
            value: value,
            error: undefined,
        });
    }

    /**
     * Initialize this Resource and all of its dependencies.
     * You should call this method only once (all other calls will be ignored).
     * If you want to call initialization method again, you should call `reInit` method.
     */
    init() {
        const data = this.data$.getValue();
        if (data.initialized || data.initializing) { // Prevent double initialization
            return;
        }

        this.data$.next({
            ...data,
            initialized: false,
            initializing: true,
            loading: true,
        });

        if (this.dependencies.length > 0) {
            // Pass loading state from dependencies to current resource
            if (this.reInitOnDependencyChange) {
                combineLatest(
                    this.dependencies.map(d => d.data$
                        .pipe(
                            map(d => d.loading),
                            takeUntil(this.destroy$),
                        ),
                    ),
                )
                    .pipe(
                        takeUntil(this.destroy$),
                    )
                    .subscribe((depLoadingState) => {
                        this.isDependencyLoading = depLoadingState.some(dl => dl);
                        const newLoadingState = this.isDependencyLoading || this.isResourceLoading;
                        const data = this.data$.getValue();
                        if (data.loading !== newLoadingState) {
                            this.data$.next({
                                ...data,
                                loading: newLoadingState,
                            });
                        }
                    });
            }

            // Subscribe to dependency changes and call initialize function
            if (this.initFunction != null) {
                combineLatest(
                    this.dependencies.map(d => d.data$
                        .pipe(
                            filter(d => d.initialized && !d.initializing && !d.loading && !d.error),

                            this.reInitOnDependencyChange
                                ? distinctUntilChanged((previous, current) => previous.value === current.value) // or deepEqual
                                : tap(),

                            takeUntil(this.destroy$),
                        ),
                    ),
                )

                    // At this point we'll get array of initialized Resources data
                    .pipe(
                        this.reInitOnDependencyChange ? tap() : take(1),
                        catchError((err, caught) => {
                            this.handleError(
                                'An error occurred in an Observable used to monitor the states of dependent Resources during initialization.',
                                err,
                            );
                            return caught;
                        }),
                        takeUntil(this.destroy$),
                    )

                    .subscribe((resources) => {
                        this.handleInitFunction(resources);
                    });
            }

            // Init dependencies
            this.dependencies.forEach(d => d.init());

        } else {
            // no dependencies
            this.handleInitFunction([]);
        }
    }

    /**
     * Force reinitialize resource.
     * If you call this function, it will take the latest values from dependencies and call initialization function.
     */
    reInit() {
        const data = this.data$.getValue();
        if (data.loading) { // Prevent double initialization
            return;
        }

        this.data$.next({
            ...data,
            loading: true,
        });

        combineLatest(
            this.dependencies.map(d => d.data$
                .pipe(
                    filter(d => d.initialized && !d.initializing && !d.loading && !d.error),
                    takeUntil(this.destroy$),
                ),
            ),
        )
            .pipe(
                take(1),
                catchError((err, caught) => {
                    this.handleError(
                        'An error occurred in an Observable used to monitor the states of dependent Resources during reinitialization.',
                        err,
                    );
                    return caught;
                }),
                takeUntil(this.destroy$),
            )
            .subscribe((resources) => {
                this.handleInitFunction(resources);
            });
    }

    private async handleInitFunction(resources: any[]) {
        if (!this.initFunction) {
            return;
        }

        try {
            const data = this.data$.getValue();
            this.isResourceLoading = true;
            if (!data.loading) {
                this.data$.next({
                    ...data,
                    loading: true,
                });
            }

            // We need initAttemptCounter to prevent situations when this.initFunction fires multiple
            //  times when previous calls takes more time than latest.
            this.initAttemptCounter++;
            const currentCounter = this.initAttemptCounter;
            const result = await this.initFunction(resources.map(r => r.value), this);
            if (currentCounter !== this.initAttemptCounter) {
                return;
            }

            this.reInitObservableSubscription?.unsubscribe();
            this.reInitObservableSubscription = undefined;
            this.reInitLoadingObservableSubscription?.unsubscribe();
            this.reInitLoadingObservableSubscription = undefined;

            if (result && isObservable(result)) {

                this.reInitObservableSubscription = result
                    .pipe(
                        distinctUntilChanged((previous, current) => previous === current), // deepEqual
                        catchError((err, caught) => {
                            this.handleError(
                                'An error occurred in an Observable that was returned from a Resource\'s initialization function.',
                                err,
                            );
                            return caught;
                        }),
                        takeUntil(this.destroy$),
                    )
                    .subscribe((val) => {
                        this.isResourceLoading = false;
                        this.data$.next({
                            ...this.data$.getValue(),
                            loading: this.isResourceLoading || this.isDependencyLoading,
                            initializing: false,
                            initialized: true,
                            error: undefined,
                            value: val,
                        });
                    });

            } else if (result && result instanceof Resource) {

                // Subscribe for loading state
                this.reInitLoadingObservableSubscription = result.data$
                    .pipe(
                        filter(v => v.loading),
                        takeUntil(this.destroy$),
                    )
                    .subscribe(() => {
                        const data = this.data$.getValue();
                        if (!data.loading) {
                            this.data$.next({
                                ...data,
                                loading: true,
                            });
                        }
                    });


                // Subscribe for data
                this.reInitObservableSubscription = result.data$
                    .pipe(
                        filter(v => v.initialized && !v.initializing && !v.loading && !v.error),
                        map(v => v.value),
                        // distinctUntilChanged((previous, current) => deepEqual(previous, current)),
                        catchError((err, caught) => {
                            this.handleError(
                                'An error occurred in an Resource that was returned from a Resource\'s initialization function.',
                                err,
                            );
                            return caught;
                        }),
                        takeUntil(this.destroy$),
                    )
                    .subscribe((val) => {
                        this.isResourceLoading = false;
                        this.data$.next({
                            ...this.data$.getValue(),
                            loading: this.isResourceLoading || this.isDependencyLoading,
                            initializing: false,
                            initialized: true,
                            error: undefined,
                            value: val,
                        });
                    });

                // Initialize dependant resource
                result.init();

            } else {
                this.isResourceLoading = false;
                this.data$.next({
                    ...this.data$.getValue(),
                    loading: this.isResourceLoading || this.isDependencyLoading,
                    initializing: false,
                    initialized: true,
                    value: result as T,
                    error: undefined,
                });

            }
        } catch (error) {
            this.isResourceLoading = false;
            this.handleError(
                'An error occurred while executing the Resource initialization function.',
                error,
            );
            return;
        }
    }

    private handleError(errorSourceDescription: string, error?: any) {
        if (!errorSourceDescription) {
            errorSourceDescription = 'Unknown error';
        }

        // @ts-ignore
        if (console) {
            // @ts-ignore
            console.warn(errorSourceDescription);
            // @ts-ignore
            console.warn(error);
            // @ts-ignore
            console.log(this);
        }

        this.data$.next({
            ...this.data$.getValue(),
            loading: false,
            initializing: false,
            initialized: true,
            value: undefined,
            error: error || errorSourceDescription,
        });
    }
}

export interface ResourceConfig<T> {
    /**
     * Initialization method. Optional.
     * This method will only be called if all dependent resources have been successfully initialized.
     *
     * Must return a resource value, or a Promise of resource value, or Observable of resource value.
     *
     * You can also initialize code here that will update the value from time to time.
     * For example, a websocket connection, or once every n seconds.
     * You can set data using `resource.setValue()`.
     * But don't forget to use `resource.destroy$` Subject to clean up.
     */
    init?: (
        (
            /**
             * List of dependent resource values.
             */
            dependencies: this['dependencies'] extends null | undefined ? []
                : this['dependencies'] extends (Resource<infer DependencyResourceType>[] | undefined) ? DependencyResourceType[] : never,
            /**
             * The current resource
             */
            resource: Resource<T>,
        )
            => T | Observable<T> | Resource<T> | Promise<T | Observable<T> | Resource<T>>
        );

    /**
     * List of resource dependencies.
     */
    dependencies?: Resource<any>[];

    /**
     * Whether to reinitialize the resource if one of the dependencies has changed. True by default.
     */
    reInitOnDependencyChange?: boolean;

    /**
     * A strategy for tracking dependency changes. 'value' by default.
     *  'equal' - checks by ==
     *  'strictEqual' - checks by ===
     *  'value' - checks by deep equal algorithm (very resource intensive way)
     */
    dependencyChangeTrackingStrategy?: 'equal' | 'strictEqual' | 'value';

    /**
     * Default value.
     * Will be immediately set to the current value, although the loading indication will work as usual.
     */
    defaultValue?: T;
}

export interface ResourceState<T> {
    /**
     * Field indicating that resource was initialized at least once.
     */
    initialized: boolean;

    /**
     * Field indicating that resource is initializing right now
     */
    initializing: boolean;

    /**
     * Field indicating that the resource is currently being loaded or has not yet been initialized.
     */
    loading: boolean;

    /**
     * Current value of the resource. May be undefined during loading process.
     */
    value?: T;

    /**
     * Error occurred during initialization process
     */
    error?: any;
}
