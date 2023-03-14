import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import { InjectRedis } from './redis.decorators';

describe('RedisModule', () => {
  it('Instance Redis', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RedisModule.forRoot({
       config: {
        host: '127.0.0.1',
        port: 6379,
       }
      })],
    }).compile();

    const app = module.createNestApplication();
    await app.init();
    const redisModule = module.get(RedisModule);
    expect(redisModule).toBeInstanceOf(RedisModule);

    await app.close();
  });

  it('inject redis connection', async () => {

    @Injectable()
    class TestProvider {
      constructor(@InjectRedis() private readonly redis: Redis) {}

      getClient() {
        return this.redis;
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      imports: [RedisModule.forRoot({
        config: {
          host: '127.0.0.1',
          port: 6379,
        }
      })],
      providers: [TestProvider],
    }).compile();

    const app = module.createNestApplication();
    await app.init();

    const provider = module.get(TestProvider);
    expect(provider.getClient()).toBeInstanceOf(Redis);

    await app.close();
  });
});
