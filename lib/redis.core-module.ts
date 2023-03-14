import { ModuleRef } from '@nestjs/core';
import { DynamicModule, Module, Global, Provider, OnApplicationShutdown } from '@nestjs/common';
import { RedisModuleAsyncOptions, RedisModuleOptions, RedisModuleOptionsFactory } from './redis.interfaces';
import { createRedisConnection, getRedisOptionsToken, getRedisConnectionToken } from './redis.utils'
import { Redis } from 'ioredis';

@Global()
@Module({})
export class RedisCoreModule implements OnApplicationShutdown {

  constructor(private readonly moduleRef: ModuleRef) {}

  static tokens: string[] = [];

  /* forRoot */
  static forRoot(options: RedisModuleOptions, connection?: string): DynamicModule {

    const redisOptionsProvider: Provider = {
      provide: getRedisOptionsToken(connection),
      useValue: options,
    };

    const connectionToken = getRedisConnectionToken(connection);
    RedisCoreModule.tokens.push(connectionToken);

    const redisConnectionProvider: Provider = {
      provide: connectionToken,
      useValue: createRedisConnection(options),
    };

    return {
      module: RedisCoreModule,
      providers: [
        redisOptionsProvider,
        redisConnectionProvider,
      ],
      exports: [
        redisOptionsProvider,
        redisConnectionProvider,
      ],
    };
  }

  /* forRootAsync */
  public static forRootAsync(options: RedisModuleAsyncOptions, connection: string): DynamicModule {

    const redisConnectionProvider: Provider = {
      provide: getRedisConnectionToken(connection),
      useFactory(options: RedisModuleOptions) {
        return createRedisConnection(options)
      },
      inject: [getRedisOptionsToken(connection)],
    };

    return {
      module: RedisCoreModule,
      imports: options.imports,
      providers: [...this.createAsyncProviders(options, connection), redisConnectionProvider],
      exports: [redisConnectionProvider],
    };
  }

  /* createAsyncProviders */
  public static createAsyncProviders(options: RedisModuleAsyncOptions, connection?: string): Provider[] {

    if(!(options.useExisting || options.useFactory || options.useClass)) {
      throw new Error('Invalid configuration. Must provide useFactory, useClass or useExisting');
    }

    if (options.useExisting || options.useFactory) {
      return [
        this.createAsyncOptionsProvider(options, connection)
      ];
    }

    return [ 
      this.createAsyncOptionsProvider(options, connection), 
      { provide: options.useClass, useClass: options.useClass },
    ];
  }

  /* createAsyncOptionsProvider */
  public static createAsyncOptionsProvider(options: RedisModuleAsyncOptions, connection?: string): Provider {

    if(!(options.useExisting || options.useFactory || options.useClass)) {
      throw new Error('Invalid configuration. Must provide useFactory, useClass or useExisting');
    }

    if (options.useFactory) {
      return {
        provide: getRedisOptionsToken(connection),
        useFactory: options.useFactory,
        inject: options.inject || [],
      };
    }

    return {
      provide: getRedisOptionsToken(connection),
      async useFactory(optionsFactory: RedisModuleOptionsFactory): Promise<RedisModuleOptions> {
        return await optionsFactory.createRedisModuleOptions();
      },
      inject: [options.useClass || options.useExisting],
    };
  }


  async onApplicationShutdown(): Promise<void> {
    const waitForStatus = async (redis: Redis, status: string) => {
      let times = 0;
      while (redis.status != status && times < (3000 / 200)) {
        times++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (redis.status != status) {
        throw "Never reached redis state '${status}' within 3 seconds";
      }
    }

    for (let i = 0; i < RedisCoreModule.tokens.length; ++i) {
      const redisConn = await this.moduleRef.resolve<Redis>(RedisCoreModule.tokens[i]);
      // Can't quit before ready.
      await waitForStatus(redisConn, 'ready');
      await redisConn.quit();
      await waitForStatus(redisConn, 'end');
    }
  }
}
