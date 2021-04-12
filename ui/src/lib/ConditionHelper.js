class ConditionHelper
{

constructor() {}

getSupportedServices() {
    return ['marketCap'];
}

getExchangeFields() {
    return ['last', 'buy', 'sell', 'high', 'low', 'volume', 'priceChangePercent'];
}

getMarketCapFields() {
    return ['price_usd', 'btc_price', 'volume_24_usd', 'circulating_supply', 'market_cap_usd', 'percent_change_1h', 'percent_change_1d', 'percent_change_7d'];
}

getValue(condition) {
    if ('in' == condition.condition.operator || 'out' == condition.condition.operator) {
        return `[${condition.condition.value[0]},${condition.condition.value[1]}]`;
    }
    return `${condition.condition.value}`;
}

getFieldDescriptionForExchangeField(field) {
    switch (field) {
        case 'last':
            return 'last trade price';
        case 'buy':
            return 'buy/bid price';
        case 'sell':
            return 'sell/ask price';
        case 'high':
            return 'highest price over 24h';
        case 'low':
            return 'lowest price over 24h';
        case 'volume':
            return 'volume over 24h';
        case 'priceChangePercent':
            return 'price change (%) over 24h';
    }
    console.warn(`Could not get description for exchange field '${field}'`);
    return field;
}

getFieldDescriptionForMarketCapField(field) {
    switch (field) {
        case 'price_usd':
            return 'USD price';
        case 'btc_price':
            return 'BTC price';
        case 'volume_24_usd':
            return 'USD volume over 24h';
        case 'circulating_supply':
            return 'coins supply';
        case 'market_cap_usd':
            return 'market cap in USD';
        case 'percent_change_1h':
            return 'price change (%) over 1h';
        case 'percent_change_1d':
            return 'price change (%) over 24h';
        case 'percent_change_7d':
            return 'price change (%) over 7 days';
    }
    console.warn(`Could not get description for market cap field '${field}'`);
    return field;
}

getFieldDescriptionFromCondition(condition) {
    if ('exchange' == condition.origin.type) {
        return this.getFieldDescriptionForExchangeField(condition.condition.field);
    }
    else if ('service' == condition.origin.type) {
        if ('marketCap' == condition.origin.id) {
            return this.getFieldDescriptionForMarketCapField(condition.condition.field);
        }
    }
    console.warn(`Could not get field description for condition ${JSON.stringify(condition)}`);
    return condition.condition.field;
}

getOperators() {
    return ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'out'];
}

getOperatorDescription(operator) {
    switch (operator) {
        case 'eq':
            return '==';
        case 'neq':
            return '!=';
        case 'lt':
            return '<';
        case 'lte':
            return '<=';
        case 'gt':
            return '>';
        case 'gte':
            return '>=';
        case 'in':
            return 'in range';
        case 'out':
            return 'not in range';
    }
    console.warn(`Could not get description for operator '${operator}'`);
    return operator;
}

getOperatorDescriptionFromCondition(condition) {
    return this.getOperatorDescription(condition.condition.operator);
}

getEntity(condition) {
    if ('exchange' == condition.origin.type) {
        return condition.condition.pair;
    }
    else if ('service' == condition.origin.type) {
        return condition.condition.symbol;
    }
    console.warn(`Could not get entity for condition ${JSON.stringify(condition)}`);
    return '???';
}

}

export default new ConditionHelper();
