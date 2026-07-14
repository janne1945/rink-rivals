import { memo, type ButtonHTMLAttributes, type SyntheticEvent } from "react";
import type { CardVersion, Player } from "../domain/cards";
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
};

const presentationClasses = {
  headshot: styles.headshot,
  "full-card": styles.fullCard,
  placeholder: styles.placeholder,
} satisfies Record<PlayerAssetPresentation, string>;

const neutralFallback = playerAssetManifest().fallback;

function handleImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.dataset.assetFallbackApplied === "true") {
    image.hidden = true;
    return;
  }

  image.dataset.assetFallbackApplied = "true";
  image.dataset.assetPresentation = neutralFallback.presentation;
  image.dataset.assetResolution = "placeholder";
  image.dataset.assetResolvedVariant = "placeholder";
  image.setAttribute("src", neutralFallback.path);
  image.setAttribute("width", String(neutralFallback.width));
  image.setAttribute("height", String(neutralFallback.height));
  image.classList.remove(...Object.values(presentationClasses));
  image.classList.add(presentationClasses.placeholder);

  const artwork = image.parentElement;
  if (artwork) {
    artwork.dataset.assetPresentation = neutralFallback.presentation;
    artwork.dataset.assetResolution = "placeholder";
    artwork.dataset.assetResolvedVariant = "placeholder";
    artwork.classList.remove(...Object.values(presentationClasses));
    artwork.classList.add(presentationClasses.placeholder);
  }
}

function displayLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function HockeyCardView({ card, player, selected, used, compact, status, marketStatus, eager = false, className = "", disabled, onClick, ...props }: HockeyCardProps) {
  const cardTypeLabel = displayLabel(card.cardType);
  const setLabel = displayLabel(card.setId);
  const cardImage = resolveCardImage(card, player);
  const imageKey = `${card.id}:${cardImage.src}`;
  const presentationClass = presentationClasses[cardImage.presentation];
  const fallbackApplied = cardImage.resolution === "placeholder";
  const classes = [
    styles.card,
    onClick ? styles.interactive : "",
    selected ? styles.selected : "",
    used ? styles.used : "",
    compact ? styles.compact : "",
    status || marketStatus ? styles.hasStatus : "",
    disabled ? styles.disabled : "",
    className,
  ].filter(Boolean).join(" ");

  const accessibleName = [
    player.name,
    `${card.overall} overall`,
    `${cardTypeLabel} card`,
    `${setLabel} set`,
    player.team,
    player.primaryPosition,
    player.league,
    status,
    marketStatus,
  ].filter(Boolean).join(", ");
  const content = (
    <>
      <span
        key={imageKey}
        className={`${styles.artwork} ${presentationClass}`}
        aria-hidden="true"
        data-asset-presentation={cardImage.presentation}
        data-asset-resolution={cardImage.resolution}
        data-asset-resolved-variant={cardImage.resolvedVariant}
      >
        <img
          key={imageKey}
          className={`${styles.image} ${presentationClass}`}
          src={cardImage.src}
          alt=""
          aria-hidden="true"
          width={cardImage.width}
          height={cardImage.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          onError={handleImageError}
          data-card-image={card.id}
          data-player-id={player.id}
          data-asset-presentation={cardImage.presentation}
          data-asset-resolution={cardImage.resolution}
          data-asset-requested-variant={cardImage.requestedVariant}
          data-asset-resolved-variant={cardImage.resolvedVariant}
          data-asset-fallback-applied={fallbackApplied ? "true" : "false"}
        />
      </span>
      <span className={styles.topline}>
        <span className={styles.overall}>{card.overall}<small>OVR</small></span>
        <span className={styles.league}>{player.league}</span>
      </span>
      <span className={styles.position}>{player.primaryPosition}</span>
      <span className={styles.content}>
        <span className={styles.cardMeta}>
          <span className={styles.cardType}>{cardTypeLabel}</span>
          <span className={styles.set}>{setLabel}</span>
        </span>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.team}>{player.team}{player.nationality ? ` · ${player.nationality}` : ""}</span>
      </span>
      {status || marketStatus ? (
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
        onClick={onClick}
        {...props}
      >
        {content}
      </button>
    );
  }

  return <article className={classes} aria-label={accessibleName}>{content}</article>;
}

export const HockeyCard = memo(HockeyCardView);
HockeyCard.displayName = "HockeyCard";
