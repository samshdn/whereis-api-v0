import winston from 'winston';

// instantiate a logger object
export const logger = winston.createLogger({
    level: 'info', // level
    format: winston.format.combine(
        winston.format.timestamp(), // timestamp
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        // output to console
        new winston.transports.Console(),
        // output to file
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// // 记录不同级别的日志
// logger.info('This is an info message');
// logger.warn('This is a warning message');
// logger.error('This is an error message');
//
// // 你也可以记录带有元数据的日志
// logger.info('User logged in', { userId: 123, username: 'john_doe' });
//
// // 记录错误
// try {
//     throw new Error('Something went wrong!');
// } catch (error) {
//     logger.error('An error occurred', { error });
// }