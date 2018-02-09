* _QUANTITY_ must be > _MIN_ **and** must be a multiple of _STEP_
* _RATE_ must be > _MIN_ **and** must be a multiple of _STEP_
* _TOTAL_ must be > _MIN_

<u>Examples</u> :

If _min(quantity)_ = 0.02 and _step(quantity)_ = 0.001, then :

* 0.03 will be _valid_
* 0.021 will be _valid_
* 0.022 will be _valid_
* 0.0225 will be _invalid_ (not a multiple of _step_)
* 0.02200000 will be _valid_
