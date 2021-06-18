/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
"use strict";

const util = require("util");

const deprecateContext = util.deprecate(() => {},
    "Hook.context is deprecated and will be removed");

const CALL_DELEGATE = function(...args) {
    this.call = this._createCall("sync");
    return this.call(...args);
};
const CALL_ASYNC_DELEGATE = function(...args) {
    this.callAsync = this._createCall("async");
    return this.callAsync(...args);
};
const PROMISE_DELEGATE = function(...args) {
    this.promise = this._createCall("promise");
    return this.promise(...args);
};

class Hook {
    constructor(args = [], name = undefined) {
        this._args = args;
        this.name = name;
        this.taps = [];
        this.interceptors = [];
        this._call = CALL_DELEGATE;
        this.call = CALL_DELEGATE;
        this._callAsync = CALL_ASYNC_DELEGATE;
        this.callAsync = CALL_ASYNC_DELEGATE;
        this._promise = PROMISE_DELEGATE;
        this.promise = PROMISE_DELEGATE;
        this._x = undefined;

        this.compile = this.compile;
        this.tap = this.tap;
        this.tapAsync = this.tapAsync;
        this.tapPromise = this.tapPromise;
    }

    //抽象方法，需要被重写
    compile(options) {
        throw new Error("Abstract: should be overridden");
    }

    //TODO:
    _createCall(type) {
        return this.compile({
            taps: this.taps,
            interceptors: this.interceptors,
            args: this._args,
            type: type
        });
    }

    //监听事件

    /**
     * 
     * @param {*} type 
     * @param {*} options 可能为对象(name为事件名)或者字符串(代表事件名)
     * @param {*} fn 
     */
    _tap(type, options, fn) {
        if (typeof options === "string") {
            options = {
                //事件名去空格
                name: options.trim()
            };
        } else if (typeof options !== "object" || options === null) {
            throw new Error("Invalid tap options");
        }
        if (typeof options.name !== "string" || options.name === "") {
            throw new Error("Missing name for tap");
        }

        //
        if (typeof options.context !== "undefined") {
            deprecateContext();
        }

        //打平(相当于把name放入options中)
        options = Object.assign({ type, fn }, options);
        options = this._runRegisterInterceptors(options);
        this._insert(options);
    }

    //封装tap接口
    tap(options, fn) {
        this._tap("sync", options, fn);
    }
    tapAsync(options, fn) {
        this._tap("async", options, fn);
    }
    tapPromise(options, fn) {
        this._tap("promise", options, fn);
    }

    //执行所有拦截器
    _runRegisterInterceptors(options) {
        //遍历所有拦截器
        for (const interceptor of this.interceptors) {
            //如果拦截器有拦截register的事件
            if (interceptor.register) {
                //执行拦截事件回调，如果修改了tagInfo的话则返回新的info
                const newOptions = interceptor.register(options);
                if (newOptions !== undefined) {
                    options = newOptions;
                }
            }
        }
        return options;
    }

    withOptions(options) {
        const mergeOptions = opt =>
            Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

        return {
            name: this.name,
            tap: (opt, fn) => this.tap(mergeOptions(opt), fn),
            tapAsync: (opt, fn) => this.tapAsync(mergeOptions(opt), fn),
            tapPromise: (opt, fn) => this.tapPromise(mergeOptions(opt), fn),
            intercept: interceptor => this.intercept(interceptor),
            isUsed: () => this.isUsed(),
            withOptions: opt => this.withOptions(mergeOptions(opt))
        };
    }

    //是否订阅事件
    isUsed() {
        return this.taps.length > 0 || this.interceptors.length > 0;
    }

    //拦截器
    intercept(interceptor) {
        this._resetCompilation();

        //添加拦截器
        this.interceptors.push(Object.assign({}, interceptor));
        if (interceptor.register) {
            //如果刚添加的拦截器有监听register，那么已有的tap事件需要执行一遍（因为register允许修改tapInfo）
            for (let i = 0; i < this.taps.length; i++) {

                //修改完tapInfo还会返回tapInfo
                this.taps[i] = interceptor.register(this.taps[i]);
            }
        }
    }

    //清空状态TODO:
    _resetCompilation() {
        this.call = this._call;
        this.callAsync = this._callAsync;
        this.promise = this._promise;
    }


    //把tapInfo添加到taps数组（tapInfo[]）中去
    _insert(item) {
        this._resetCompilation();

        //判断是否有before属性，转换成字符串数组
        let before;
        if (typeof item.before === "string") {
            before = new Set([item.before]);
        } else if (Array.isArray(item.before)) {
            before = new Set(item.before);
        }

        //获取state数字
        let stage = 0;
        if (typeof item.stage === "number") {
            stage = item.stage;
        }

        let i = this.taps.length;
        //从后向前遍历订阅的taps，会一直找到需要插入的位置
        while (i > 0) {
            i--;
            //整体后移一位
            const x = this.taps[i];
            this.taps[i + 1] = x;

            //拿到当前的权重
            const xStage = x.stage || 0;

            //先判断before是否包含当前item
            if (before) {
                //before里面包含当前item，说明item要插入到当前item前面，继续向前循环
                if (before.has(x.name)) {
                    before.delete(x.name);
                    continue;
                }

                //当前item不在before里面，但before里还要值，那么得继续向前遍历（因为得保证在指定的before前面）
                if (before.size > 0) {
                    continue;
                }
            }
            //如果没有指定before，那么比较权重，当前权重大于新的，那么新的得继续往前面放
            if (xStage > stage) {
                continue;
            }

            i++;
            break;
        }

        //直接覆盖新添加的item
        this.taps[i] = item;
    }
}

Object.setPrototypeOf(Hook.prototype, null);

module.exports = Hook;