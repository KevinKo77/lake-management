/** Frozen, exported logistic coefficients. No network, label, future match or live-data inference. */
export function promotionProbability(model,features){
 if(!model||!Array.isArray(features)||features.length!==6||features.some(x=>!Number.isFinite(x)))throw Error('Six finite historical features required');
 for(const key of ['mean','scale','coef'])if(!Array.isArray(model[key])||model[key].length!==6||model[key].some(x=>!Number.isFinite(x)))throw Error('Invalid model artifact');
 if(model.scale.some(x=>x<=0)||!Number.isFinite(model.intercept)||!Number.isFinite(model.calibration?.slope)||!Number.isFinite(model.calibration?.intercept))throw Error('Invalid calibration artifact');
 const z=features.reduce((sum,x,i)=>sum+(x-model.mean[i])/model.scale[i]*model.coef[i],model.intercept);
 const calibrated=z*model.calibration.slope+model.calibration.intercept;
 return calibrated>=0?1/(1+Math.exp(-calibrated)):Math.exp(calibrated)/(1+Math.exp(calibrated));
}
export function validateHistoricalPrediction(row){
 if(!row||row.kind!=='historical-out-of-season-backtest'||typeof row.club!=='string'||!/^20\d\d-\d\d$/.test(row.season)||!['10','21','32'].includes(String(row.stage))||!/^\d{4}-\d{2}-\d{2}$/.test(row.cutoff))throw Error('Historical backtest record required');
 if(!(row.trainingEnd<row.calibrationSeason&&row.calibrationSeason<row.season))throw Error('Chronology violation');
 if(!Number.isFinite(row.probability)||row.probability<0||row.probability>1||!Array.isArray(row.interval)||row.interval.length!==2||row.interval.some(x=>!Number.isFinite(x)||x<0||x>1)||row.interval[0]>row.probability||row.interval[1]<row.probability)throw Error('Invalid probability or uncertainty range');
 return row;
}
