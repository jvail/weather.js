
/*
  Solar radiation and daylength depending only on latitude and temperature (min, max) input

  REFERENCES
  
  Allen, Richard G. et al. 1998.
  Crop evapotranspiration - Guidelines for computing crop water requirements
  FAO Irrigation and drainage paper 56

  Johnson. I.R. 2013.
  DairyMod and the SGS Pasture Model: a mathematical description of the biophysical
    
  Rotz, C. A., Corson, M.S., Chianese, D.S., Montes, F., Hafner, S.D., Bonifacio, H.F. and Coiner, C.U. 2014. 
  The integrated farm system model: reference manual version 4.1. 
  Available: http://afrsweb.usda.gov/SP2UserFiles/Place/19020500/Reference%20Manual.pdf Accessed January 3, 2015.

  Samani, Zohrab. 2000.
  Estimating Solar Radiation and Evapotranspiration Using Minimum Climatological Data.
  J. Irrig. Drain
  
  Supit, I. 2003.
  Updated system description of the WOFOST crop growth simulation model as implemented
  in the Crop Growth Monitoring System applied by the European Commission 
  (http://www.treemail.nl/download/treebook7/start.htm)

  LICENSE

  Copyright 2014 Jan Vaillant <jan.vaillant@zalf.de>

  Distributed under the MIT License. See accompanying file LICENSE or copy at http://opensource.org/licenses/MIT
*/

var weather = weather || {};

/*
  Rotz (2014)

  Simple estimate of relative humidity if not available in weather data

  rh    [-]   relative humidity
  T_mn  [°C]  minimum temperature
  T_mx  [°C]  maximum temperature
*/

weather.rh = function (T_mn, T_mx) {

  return Math.min(1, 1 - Math.exp(-0.2 * (T_mx - T_mn)));

};

weather.solar = (function () {

var PI = Math.PI
  , sin = Math.sin
  , cos = Math.cos
  , tan = Math.tan
  , acos = Math.acos
  , sqrt = Math.sqrt
  , pow = Math.pow
  , ceil = Math.ceil
  , MS_PER_DAY = 1000 * 60 * 60 * 24
  ;

/*
  Allen (1998) eq. 22

  rad [rad] 
  deg [decimal degrees]
*/

var rad = function (deg) {

  return (PI / 180) * deg;
  
};

/*
  Allen (1998) eq. 23

  dr  []  Inverse relative distance Earth-Sun
  J   [#] Day of year (1 - 366)
*/

var dr = function (J) {

  return 1 + (0.033 * cos(((2 * PI) / 356) * J));

};

/*
  Allen (1998) eq. 24

  d [rad] Solar declination
  J [#]   Day of year (1 - 366)
*/

var d = function (J) {
  
  return 0.409 * sin((((2 * PI) / 365) * J) - 1.39);

};

/*
  Allen (1998) eq. 25

  ws  [rad]             Sunset hour angle
  j   [decimal degree]  Latitude
  d   [rad]             Solar declination
*/

var ws = function (j, d) {

  return acos(-tan(rad(j)) * tan(d));

};


/*
  Allen (1998) eq. 21

  R_a   [MJ m-2 day-1]    Extraterrestrial radiation
  Gsc   [MJ m-2 min-1]    Solar constant = 0.0820 
  dr    []                Inverse relative distance Earth-Sun (eq. 23)
  ws    [rad]             Sunset hour angle (eqs. 25 or 26)
  j     [decimal degree]  Latitude
  d     [rad]             Solar declination (eq. 24)
*/

var R_a = function (dr, ws, j, d, unit) {

  if (unit !== 'mj' && unit !== 'mm')
    unit = 'mj';
    
  var Gsc = 0.0820;
  var R_a = ((24 * 60) / PI) * Gsc * dr * ((ws * sin(rad(j)) * sin(d)) + (cos(rad(j)) * cos(d) * sin(ws)));
  
  return (unit === 'mj') ? R_a : R_a * 0.408;

};

/*
  Samani (2000) eqs. 1 and 3

  R_s   [MJ m-2 day-1]  Solar or shortwave radiation
  R_a   [MJ m-2 day-1]  Extraterrestrial radiation
  T_mn  [°C]            Minimum temperature
  T_mx  [°C]            Maximum temperature
*/

var R_s = function (R_a, T_mn, T_mx) {

  var TD = T_mx - T_mn
    , KT = 0.00185 * pow(TD, 2) - 0.0433 * TD + 0.4023
    ; 

  return KT * R_a * sqrt(TD);

};

/*
  Allen (1998) eq. 34

  N   [hour]  Maximum possible duration of sunshine or daylight hours
  ws  [rad]   Sunset hour angle in radians
*/

var N = function (ws) {
  
  return (24 / PI) * ws;

};

/*
  PAR [MJ m-2 day-1]  Photosynthetically active radiation
  R_s [MJ m-2 day-1]  Solar or shortwave radiation
*/

var PAR = function (R_s) {
  
  /* 0.45, .., 0.5 ? */ 
  return 0.5 * R_s;

};

/*
  Johnson (2013) eq. 2.8

  PPF [μmol (photons) m-2 day-1]  Photosynthetic photon flux
  PAR [J m-2 day-1]               Photosynthetic active ration

  TODO: estimated 0.218 based on location?
*/

var PPF = function (PAR) { 

  return PAR / 0.218;     

};

/*
  Supid (2003) eqs. 4.28a - 4.28d

  Defaults to 0.7 in Johnson (2013).

  f_s   [-]             Fraction of direct solar radiation
  R_s   [MJ m-2 day-1]  Solar or shortwave radiation
  R_a   [MJ m-2 day-1]  Extraterrestrial radiation            
*/

var f_s = function (R_s, R_a) {

  var f_d = 0 /* Fraction of diffuse solar radiation */
    , T_atm = R_s / R_a /* Fraction of R_s in R_a */
    ;

  if (T_atm <= 0.07)
    f_d = 1;
  else if (0.07 < T_atm && T_atm <= 0.35)
    f_d = 1 - 2.3 * pow(T_atm - 0.07, 2);
  else if (0.35 < T_atm && T_atm <= 0.75)
    f_d = 1.33 - 1.46 * T_atm;
  else if (0.75 < T_atm)
    f_d = 0.23;

  return 1 - f_d;

};

/*
  Returns array with length no_days.

  j           [decimal degree]  latitude
  T_mn        [°C]              array minimum temperature
  T_mx        [°C]              array maximum temperature
  first_year  [year]
  last_year   [year]
*/

return (function (j, T_mn, T_mx, first_year, last_year) {

  var no_days = ceil((new Date(last_year + 1, 0, 1) - new Date(first_year, 0, 1)) / MS_PER_DAY);

  if (T_mn.length !== no_days || T_mx.length !== no_days) {
    console.log('T_mn or T_mx != no_days');
    return null;
  }

  /* return value */
  var ret = {

      /* Maximum possible duration of sunshine or daylight hours [hour] */
      N: new Float64Array(no_days)

      /* Extraterrestrial radiation [MJ m-2 day-1] */
    , R_a: new Float64Array(no_days)

      /* Solar or shortwave radiation [MJ m-2 day-1] */
    , R_s: new Float64Array(no_days)

      /* Photosynthetically active radiation [MJ m-2 day-1] */
    , PAR: new Float64Array(no_days)

      /* Photosynthetic photon flux [μmol (photons) m-2 day-1] */
    , PPF: new Float64Array(no_days)

      /* Fraction of direct solar radiation [-] */
    , f_s: new Float64Array(no_days)

  };

  var dr_, d_, ws_, R_a_, N_, R_s_, PAR_, PPF_, f_s_;

  var day_count = 0;

  for (var year = first_year; year < last_year + 1; year++) {

    var days_in_year = ceil((new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / MS_PER_DAY);

    for (var day = 0; day < days_in_year; day++) {

      dr_   = dr(day + 1);
      d_    = d(day + 1);
      ws_   = ws(j, d_);
      R_a_  = R_a(dr_, ws_, j, d_)
      N_    = N(ws_);
      R_s_  = R_s(R_a_, T_mn[day_count], T_mx[day_count]);
      PAR_  = PAR(R_s_);
      PPF_  = PPF(PAR_ * 1e6 /* MJ to J */);
      f_s_  = f_s(R_s_, R_a_);

      ret.N[day_count]    = N_;
      ret.R_a[day_count]  = R_a_;
      ret.R_s[day_count]  = R_s_;
      ret.PAR[day_count]  = PAR_;
      ret.PPF[day_count]  = PPF_;
      ret.f_s[day_count]  = f_s_;

      day_count++;
    
    }   

  }
  
  return ret;
  
});

}());
