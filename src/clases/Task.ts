import {TaskStatus} from "../enums/TaskStatus";
import Timings from "./Timings";
import ITaskOptions from "../types/ITaskOptions";
import IUserProfile from "@ulixee/hero-interfaces/IUserProfile";
import Hero from "@ulixee/hero";
import AsyncFunction from "../helpers/AsyncFuncion";

export default class Task {
    private readonly script: string;
    public readonly options: ITaskOptions;
    public profile: IUserProfile;
    public readonly timings: Timings;
    public status: TaskStatus;
    public output: any = null;
    public error: any = null;
    private isFulfilled: boolean = false;
    public timer: NodeJS.Timeout|null = null;
    public promise: (agent: Hero) => Promise<any>;
    private readonly callback: (task: Task) => void;
    public constructor(script: string, options: ITaskOptions = {}, profile: IUserProfile = {}, callback: (task: Task) => void) {
        this.script = script;
        this.options = options;
        this.profile = profile;
        this.timings = new Timings();
        this.status = TaskStatus.CREATED;
        this.callback = callback;

        this.promise = (agent: Hero) => {
            let filfilledCheckInterval: NodeJS.Timeout|null = null;
            const promise = new Promise<any>((resolve, reject) => {
                    filfilledCheckInterval = setInterval(() => {
                        if (this.isFulfilled) {
                            const message = 'Task: Execution: fulfilled before execution ended, aborting.';
                            console.log(message);
                            reject(message);
                        }
                    }, 10);

                    return new AsyncFunction(
                        'resolve', 'reject', 'agent',
                        `try { ${this.script}; resolve(); } catch(e) { reject(e); }`
                    )
                    (resolve, reject, agent)
                }
            );

            promise
                .finally(() => {
                    clearInterval(filfilledCheckInterval!);
                })
                .then((output) => {
                    this.fulfill(TaskStatus.DONE, output);
                })
                .catch((error) => {
                    if (error instanceof Error) {
                        console.warn('Task: Script: ' + error.name + ': ' + error.message);
                    } else {
                        console.warn('Task: Script: ' + error);
                    }
                    this.fulfill(TaskStatus.FAILED, null, error);
                });

            return promise;
        }
    }

    public fulfill(status: TaskStatus, output: any = null, error: any = null, profile: IUserProfile|null = null): void {
        if (this.isFulfilled) {
            console.warn('Task: already fulfilled');
            return;
        }

        this.isFulfilled = true;
        this.timings.end();
        this.status = status;
        this.output = output;
        this.error = error;
        this.profile = profile ?? this.profile;

        this.callback(this);
    }

    public getIsFulfilled(): boolean {
        return this.isFulfilled;
    }

}