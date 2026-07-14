import { memo, useState, type ButtonHTMLAttributes, type SyntheticEvent } from "react";
import { cardPrimaryPosition, type CardVersion, type Player } from "../domain/cards";
import {
  playerAssetManifest,
  resolveCardImage,
  type PlayerAssetPresentation,
} from "../domain/cards/assets";
import styles from "./HockeyCard.module.css";

type HockeyCardProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  card: CardVersion;
  player: Player;
  selected?: boolean;
  used?: boolean;
  compact?: boolean;
  status?: string;
  marketStatus?: string;
  eager?: boolean;
  highlightedStat?: Readonly<{ label: string; value: number }>;
};

const presentationClasses = {
  headshot: styles.headshot,
  "full-card": styles.fullCard,
  placeholder: styles.placeholder,
} satisfies Record<PlayerAssetPresentation, string>;

const neutralFallback = playerAssetManifest().fallback;

function displayLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function HockeyCardView({ card, player, selected, used, compact, status, marketStatus, highlightedStat, eager = false, className = "", disabled, onClick, ...props }: HockeyCardProps) {
  const cardTypeLabel = displayLabel(card.cardType);
  const setLabel = displayLabel(card.setId);
  const cardImage = resolveCardImage(card, player);
  const primaryPosition = cardPrimaryPosition(card, player);
  const imageKey = `${card.id}:${cardImage.src}`;
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null);
  const fallbackApplied = cardImage.resolution === "placeholder" || failedImageKey === imageKey;
  const activePresentation = fallbackApplied ? neutralFallback.presentation : cardImage.presentation;
  const activeResolution = fallbackApplied ? "placeholder" : cardImage.resolution;
  const activeResolvedVariant = fallbackApplied ? "placeholder" : cardImage.resolvedVariant;
  const activeSrc = fallbackApplied ? neutralFallback.path : cardImage.src;
  const activeWidth = fallbackApplied ? neutralFallback.width : cardImage.width;
  const activeHeight = fallbackApplied ? neutralFallback.height : cardImage.height;
  const showsEmbeddedMetadata = activePresentation === "full-card";
  const presentationClass = presentationClasses[activePresentation];
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>): void => {
    if (fallbackApplied) {
      event.currentTarget.hidden = true;
      return;
    }
    setFailedImageKey(imageKey);
  };
  const classes = [
    styles.card,
    onClick ? styles.interactive : "",
    selected ? styles.selected : "",
    used ? styles.used : "",
    compact ? styles.compact : "",
    showsEmbeddedMetadata ? styles.fullArtwork : "",
    !showsEmbeddedMetadata && (status || marketStatus) ? styles.hasStatus : "",
    disabled ? styles.disabled : "",
    className,
  ].filter(Boolean).join(" ");

  const accessibleName = [
    player.name,
    `${card.overall} overall`,
    `${cardTypeLabel} card`,
    `${setLabel} set`,
    player.team,
    primaryPosition,
    player.league,
    status,
    marketStatus,
    highlightedStat ? `${highlightedStat.label} ${highlightedStat.value}` : undefined,
  ].filter(Boolean).join(", ");
  const content = (
    <>
      <span
        key={imageKey}
        className={`${styles.artwork} ${presentationClass}`}
        aria-hidden="true"
        data-asset-presentation={activePresentation}
        data-asset-resolution={activeResolution}
        data-asset-resolved-variant={activeResolvedVariant}
      >
        <img
          key={imageKey}
          className={`${styles.image} ${presentationClass}`}
          src={activeSrc}
          alt=""
          aria-hidden="true"
          width={activeWidth}
          height={activeHeight}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          onError={handleImageError}
          data-card-image={card.id}
          data-player-id={player.id}
          data-asset-presentation={activePresentation}
          data-asset-resolution={activeResolution}
          data-asset-requested-variant={cardImage.requestedVariant}
          data-asset-resolved-variant={activeResolvedVariant}
          data-asset-fallback-applied={fallbackApplied ? "true" : "false"}
        />
      </span>
      {!showsEmbeddedMetadata ? (
        <>
          <span className={styles.topline}>
            <span className={styles.overall}>{card.overall}<small>OVR</small></span>
            <span className={styles.league}>{player.league}</span>
          </span>
          <span className={styles.position}>{primaryPosition}</span>
          <span className={styles.content}>
            <span className={styles.cardMeta}>
              <span className={styles.cardType}>{cardTypeLabel}</span>
              <span className={styles.set}>{setLabel}</span>
            </span>
            <span className={styles.name}>{player.name}</span>
            <span className={styles.team}>{player.team}{player.nationality ? ` · ${player.nationality}` : ""}</span>
          </span>
        </>
      ) : null}
      {highlightedStat ? (
        <span className={styles.highlightedStat} data-highlighted-stat={highlightedStat.label}>
          <small>{highlightedStat.label}</small>
          <strong>{highlightedStat.value}</strong>
        </span>
      ) : null}
      {(status || marketStatus) && (!showsEmbeddedMetadata || highlightedStat) ? (
        <span className={styles.status}>
          {status ? <span>{status}</span> : null}
          {marketStatus ? <small>{marketStatus}</small> : null}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={accessibleName}
        data-card-presentation={activePresentation}
        onClick={onClick}
        {...props}
      >
        {content}
      </button>
    );
  }

  return <article className={classes} aria-label={accessibleName} data-card-presentation={activePresentation}>{content}</article>;
}

export const HockeyCard = memo(HockeyCardView);
HockeyCard.displayName = "HockeyCard";
