import TasksPoolHandler from "./clases/TasksPoolHandler";
import {TaskStatus} from "./enums/TaskStatus";
import {ISODate} from "./helpers/ISODate";
import WebServer from "./clases/WebServer";
import {readFileSync} from "fs";
import * as OS from "os";
import ITasksPoolHandler from "./types/ITasksPoolHandler";
import IWebServerConfig from "./types/IWebServerConfig";
import Task from "./clases/Task";
import {envInt} from "./helpers/EnvHelper";
import {bytesToMegabytes} from "./helpers/OSHelper";
import Logger from "./clases/Logger";

Logger.hook();
process.on('warning', e => console.warn(e.stack));
process.on('uncaughtException', e => console.warn(e.stack))

const config: IWebServerConfig & ITasksPoolHandler = JSON.parse(readFileSync(__dirname + '/../config.json', 'utf8'));

const webServer = new WebServer(config.SERVER_PORT);
webServer.setAuthKey(config.AUTH_KEY);
webServer.start()
    .on('listening', () => {

        const tasksHandler = new TasksPoolHandler(
            config.DEFAULT_MAX_CONCURRENCY,
            config.DEFAULT_SESSION_TIMEOUT,
            config.DEFAULT_QUEUE_TIMEOUT,
            config.DEFAULT_UPSTREAM_PROXY_URL,
            config.DEFAULT_BLOCKED_RESOURCE_TYPES
        );
        console.log('Browser Handler runned');

        const buildTimeStamp: string | null = readFileSync('./dist/buildtimestamp', 'utf8').trim() ?? null;
        const runTimeStamp: string | null = (new ISODate()).toString();

        webServer.get('/', (request, response) => {
            response.json({
                health: 'ok',
            });
        });

        webServer.get('/stats', (request, response) => {
            const freeMem = OS.freemem();
            response.json({
                timestamp: {
                    build: buildTimeStamp,
                    run: runTimeStamp
                },
                task: {
                    timeout: {
                        session: envInt('SESSION_TIMEOUT') ?? config.DEFAULT_SESSION_TIMEOUT,
                        queue: envInt('QUEUE_TIMEOUT') ?? config.DEFAULT_QUEUE_TIMEOUT,
                    },
                    concurrency: envInt('MAX_CONCURRENCY') ?? config.DEFAULT_MAX_CONCURRENCY,
                    pool: tasksHandler.getPoolLength(),
                    queue: tasksHandler.getQueueLength(),
                    counter: {
                        total: tasksHandler.getCounterTotal(),
                        ...tasksHandler.getCounter()
                    }
                },
                server: {
                    uptime: OS.uptime(),
                    platform: OS.platform(),
                    arch: OS.arch(),
                    cores: OS.cpus().length,
                    ram: {
                        total: bytesToMegabytes(OS.totalmem()),
                        free: bytesToMegabytes(freeMem),
                        used: bytesToMegabytes(OS.totalmem() - freeMem),
                    }
                }
            });
        });

        webServer.get('/logs', (request, response) => {
            response.json(Logger.getRows());
        })

        webServer.post(`/task`, async (request, response) => {
            if (typeof request.body.script === 'string'
                && (typeof request.body.options === 'undefined' || typeof request.body.options === 'object')
                && (typeof request.body.profile === 'undefined' || typeof request.body.profile === 'object')
            ) {
                tasksHandler.process(new Task(
                    request.body.script,
                    request.body.options ?? {},
                    request.body.profile ?? {}
                ), (task) => {
                    if (task.status === TaskStatus.DONE) {
                        response
                            .status(200)
                            .json({
                                status: task.status,
                                timings: task.timings,
                                options: task.options,
                                profile: task.profile,
                                output: task.output,
                                error: task.error?.toString() ?? null
                            });
                    }
                    else {
                        response
                            .status(500)
                            .json({
                                status: task.status,
                                timings: task.timings,
                                options: task.options,
                                profile: task.profile,
                                output: task.output,
                                error: task.error?.toString() ?? null
                            });
                    }
                });
            } else {
                response
                    .status(500)
                    .json({
                        status: TaskStatus.BAD_ARGS,
                        timings: null,
                        options: null,
                        profile: null,
                        output: null,
                        error: 'Bad arguments'
                    })
            }
        });
    })
    .on('error', () => {
        console.error('Process stopped, port is busy.');
        process.exit(1);
    })

