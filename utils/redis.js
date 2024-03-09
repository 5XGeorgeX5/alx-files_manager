import { promisify } from 'util';
import { createClient } from 'redis';

class RedisClient {
  constructor () {
    this.client = createClient();
    this.client.on('error', (err) => console.log(err));
    this.Get = promisify(this.client.get).bind(this.client);
    this.SetExp = promisify(this.client.set).bind(this.client);
    this.Del = promisify(this.client.del).bind(this.client);
  }

  isAlive () {
    return this.client.connected;
  }

  async get (key) {
    return this.Get(key).then((value) => value);
  }

  async set (key, value, duration) {
    await this.SetExp(key, value);
    if (duration) {
      await this.client.expire(key, duration);
    }
  }

  async del (key) {
    await this.Del(key);
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
