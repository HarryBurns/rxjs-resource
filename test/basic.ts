import {describe, it} from 'mocha';
import {Resource} from "../src";
import {assert} from "chai";

describe('[Basic tests]', () => {

    it('', (done) => {
        let i = 0;
        const r = new Resource<string>({
            init: () => {
                return '123';
            }
        });

        r.init();

        r.value$.subscribe((v) => {
            i++;
            if (i === 1) {
                assert.isUndefined(v);
            } else {
                assert.equal(v, '123');
            }
        });

        setTimeout(() => {
            assert.equal(i, 2);
            done();
        }, 500);
    });


});
