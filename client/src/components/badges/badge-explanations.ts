import type { BadgeId } from "@ecoride/shared/types";
import type { Locale } from "@/i18n/provider";

/** Keep these criteria aligned with BADGE_THRESHOLDS in server/src/lib/badges.ts. */
export const BADGE_EXPLANATIONS: Record<BadgeId, Record<Locale, string>> = {
  first_trip: {
    fr: "Effectuer votre premier trajet à vélo.",
    en: "Complete your first bike trip.",
  },
  trips_10: { fr: "Effectuer 10 trajets à vélo.", en: "Complete 10 bike trips." },
  trips_50: { fr: "Effectuer 50 trajets à vélo.", en: "Complete 50 bike trips." },
  trips_100: { fr: "Effectuer 100 trajets à vélo.", en: "Complete 100 bike trips." },
  trips_250: { fr: "Effectuer 250 trajets à vélo.", en: "Complete 250 bike trips." },
  trips_500: { fr: "Effectuer 500 trajets à vélo.", en: "Complete 500 bike trips." },
  km_100: { fr: "Parcourir 100 km à vélo au total.", en: "Ride a total of 100 km." },
  km_500: { fr: "Parcourir 500 km à vélo au total.", en: "Ride a total of 500 km." },
  km_1000: { fr: "Parcourir 1 000 km à vélo au total.", en: "Ride a total of 1,000 km." },
  km_2500: { fr: "Parcourir 2 500 km à vélo au total.", en: "Ride a total of 2,500 km." },
  km_5000: { fr: "Parcourir 5 000 km à vélo au total.", en: "Ride a total of 5,000 km." },
  km_10000: { fr: "Parcourir 10 000 km à vélo au total.", en: "Ride a total of 10,000 km." },
  co2_10kg: { fr: "Économiser 10 kg de CO₂ au total.", en: "Save a total of 10 kg of CO₂." },
  co2_100kg: { fr: "Économiser 100 kg de CO₂ au total.", en: "Save a total of 100 kg of CO₂." },
  co2_250kg: { fr: "Économiser 250 kg de CO₂ au total.", en: "Save a total of 250 kg of CO₂." },
  co2_500kg: { fr: "Économiser 500 kg de CO₂ au total.", en: "Save a total of 500 kg of CO₂." },
  co2_1t: { fr: "Économiser 1 tonne de CO₂ au total.", en: "Save a total of 1 metric ton of CO₂." },
  fuel_25l: {
    fr: "Économiser 25 litres de carburant au total.",
    en: "Save a total of 25 liters of fuel.",
  },
  fuel_50l: {
    fr: "Économiser 50 litres de carburant au total.",
    en: "Save a total of 50 liters of fuel.",
  },
  fuel_100l: {
    fr: "Économiser 100 litres de carburant au total.",
    en: "Save a total of 100 liters of fuel.",
  },
  fuel_250l: {
    fr: "Économiser 250 litres de carburant au total.",
    en: "Save a total of 250 liters of fuel.",
  },
  money_100: { fr: "Économiser 100 € au total.", en: "Save a total of €100." },
  money_250: { fr: "Économiser 250 € au total.", en: "Save a total of €250." },
  money_500: { fr: "Économiser 500 € au total.", en: "Save a total of €500." },
  money_1000: { fr: "Économiser 1 000 € au total.", en: "Save a total of €1,000." },
  streak_3: {
    fr: "Rouler 3 jours d'affilée, une fois au moins.",
    en: "Ride for 3 consecutive days at least once.",
  },
  streak_7: {
    fr: "Rouler 7 jours d'affilée, une fois au moins.",
    en: "Ride for 7 consecutive days at least once.",
  },
  streak_14: {
    fr: "Rouler 14 jours d'affilée, une fois au moins.",
    en: "Ride for 14 consecutive days at least once.",
  },
  streak_30: {
    fr: "Rouler 30 jours d'affilée, une fois au moins.",
    en: "Ride for 30 consecutive days at least once.",
  },
  streak_60: {
    fr: "Rouler 60 jours d'affilée, une fois au moins.",
    en: "Ride for 60 consecutive days at least once.",
  },
  months_active_6: {
    fr: "Effectuer un trajet dans 6 mois différents.",
    en: "Complete a trip in 6 different months.",
  },
  months_active_12: {
    fr: "Effectuer un trajet dans 12 mois différents.",
    en: "Complete a trip in 12 different months.",
  },
  weekly_goal_10: {
    fr: "Atteindre 50 km sur 10 semaines différentes (semaines UTC du lundi au dimanche).",
    en: "Ride at least 50 km in 10 different weeks (UTC Monday through Sunday).",
  },
  monthly_goal_3: {
    fr: "Atteindre 250 km sur 3 mois différents (mois UTC).",
    en: "Ride at least 250 km in 3 different months (UTC months).",
  },
  day_30: { fr: "Parcourir 30 km en une journée UTC.", en: "Ride 30 km in one UTC day." },
  day_50: { fr: "Parcourir 50 km en une journée UTC.", en: "Ride 50 km in one UTC day." },
  trip_25: {
    fr: "Effectuer un trajet d'au moins 25 km.",
    en: "Complete a trip of at least 25 km.",
  },
  trip_50: {
    fr: "Effectuer un trajet d'au moins 50 km.",
    en: "Complete a trip of at least 50 km.",
  },
  trip_2h: {
    fr: "Effectuer un trajet d'au moins 2 heures.",
    en: "Complete a trip lasting at least 2 hours.",
  },
  early_bird: {
    fr: "Démarrer 10 trajets avant 7 h, heure locale.",
    en: "Start 10 trips before 7 a.m. local time.",
  },
  night_owl: {
    fr: "Démarrer 10 trajets à partir de 21 h, heure locale.",
    en: "Start 10 trips at or after 9 p.m. local time.",
  },
  weekend_20: {
    fr: "Effectuer 20 trajets le samedi ou le dimanche (jours UTC).",
    en: "Complete 20 trips on Saturdays or Sundays (UTC days).",
  },
  all_week: {
    fr: "Effectuer au moins un trajet chaque jour de la semaine, même sur des semaines différentes (jours UTC).",
    en: "Complete at least one trip on every weekday, even across different weeks (UTC days).",
  },
  speed_20: {
    fr: "Atteindre 20 km/h de moyenne sur un trajet d'au moins 5 km.",
    en: "Average at least 20 km/h on a trip of at least 5 km.",
  },
  speed_22: {
    fr: "Atteindre 22 km/h de moyenne sur un trajet d'au moins 5 km.",
    en: "Average at least 22 km/h on a trip of at least 5 km.",
  },
  speed_25: {
    fr: "Atteindre 25 km/h de moyenne sur un trajet d'au moins 5 km.",
    en: "Average at least 25 km/h on a trip of at least 5 km.",
  },
};
