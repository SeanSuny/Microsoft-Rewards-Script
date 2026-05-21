import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'
import type {
    DashboardData,
    PunchCard,
    BasePromotion,
    FindClippyPromotion,
    PurplePromotionalItem
} from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'
import type { AxiosRequestConfig } from 'axios'
import { randomUUID } from 'crypto'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData, page: Page) {
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dailySetPromotions[todayKey]

        const activitiesUncompleted = todayData?.filter(x => !x?.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have already been completed')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'Started solving "Daily Set" items')

        await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', 'All "Daily Set" items have been completed')
    }

    public async doMorePromotions(data: DashboardData, page: Page) {
        const morePromotions: BasePromotion[] = [
            ...new Map(
                [...(data.morePromotions ?? []), ...(data.morePromotionsWithoutPromotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as BasePromotion] as const)
            ).values()
        ]

        const activitiesUncompleted: BasePromotion[] =
            morePromotions?.filter(x => {
                if (x.complete) return false
                if (x.pointProgressMax <= 0) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                return true
            }) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'MORE-PROMOTIONS',
                'All "More Promotion" items have already been completed'
            )
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'MORE-PROMOTIONS',
            `Started solving ${activitiesUncompleted.length} "More Promotions" items`
        )

        await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', 'All "More Promotion" items have been completed')
    }

    public async doOtherPromotions() {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAIOS&options=612',
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${this.bot.accessToken}`,
                    'User-Agent':
                        'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                    'X-Rewards-Country': this.bot.userData.geoLocale,
                    'X-Rewards-Language': 'zh',
                    'X-Rewards-IsMobile': '',
                    'X-Rewards-AppId': 'SAIOS/32.5.431027001',
                    'X-Rewards-PartnerId': 'startapp',
                    'X-Rewards-Flights': 'rwgobig'
                },
            }

            const response = await this.bot.axios.request(request)

            if (response.data.code != 0) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'GET-OTHER-PROMOTION-DATA',
                    `API responded with non-zero code: ${response.data.code}`
                )
                return;
            }

            const activitiesUncompleted: Record<string, any>[] =
                (response.data.response.promotions as Record<string, any>[])?.filter(x => {
                    if (x.attributes.complete == 'True') return false
                    if (x.attributes.max <= 0) return false
                    if (x.attributes.State == 'locked') return false
                    if (!x.attributes.type) return false
                    if (x.attributes.hidden == 'True') return false
                    if (x.attributes.type != 'urlreward') return false

                    return true
                }) ?? []

            let oldBalance = this.bot.userData.currentPoints
            let totalGainedPoints = 0

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Current balance before processing | oldBalance=${oldBalance}`
            )

            if (!activitiesUncompleted.length) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'OTHER-PROMOTIONS',
                    'All "Other Promotions" items have already been completed'
                )
                return
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `Started solving ${activitiesUncompleted.length} "Other Promotions" items`
            )

            for (const activity of activitiesUncompleted) {
                try {
                    const offerId = activity.attributes.offerid

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Starting activity | offerId=${offerId} | oldBalance=${oldBalance}`
                    )

                    const jsonData = {
                        id: randomUUID(),
                        amount: 1,
                        type: 101,
                        attributes: {
                            offerid: offerId,
                        },
                        country: this.bot.userData.geoLocale,
                        channel: 'SAIOS',
                        risk_context: {},
                    }

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Prepared activity payload | offerId=${offerId} | id=${jsonData.id} | amount=${jsonData.amount} | type=${jsonData.type} | country=${jsonData.country}`
                    )

                    const request: AxiosRequestConfig = {
                        url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${this.bot.accessToken}`,
                            'User-Agent':
                                'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                            'Content-Type': 'application/json',
                            'X-Rewards-Country': this.bot.userData.geoLocale,
                            'X-Rewards-Language': 'zh',
                            'X-Rewards-IsMobile': '',
                            'X-Rewards-AppId': 'SAIOS/32.5.431027001',
                            'X-Rewards-PartnerId': 'startapp',
                            'X-Rewards-Flights': 'rwgobig'
                        },
                        data: JSON.stringify(jsonData)
                    }

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Sending activity request | offerId=${offerId} | url=${request.url}`
                    )

                    const response = await this.bot.axios.request(request)

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Received activity response | offerId=${offerId} | status=${response.status}`
                    )

                    const newBalance = Number(response?.data?.response?.balance ?? oldBalance)
                    const gainedPoints = newBalance - oldBalance

                    this.bot.logger.debug(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Balance delta after activity | offerId=${offerId} | oldBalance=${oldBalance} | newBalance=${newBalance} | gainedPoints=${gainedPoints}`
                    )

                    if (gainedPoints > 0) {
                        totalGainedPoints += gainedPoints
                        this.bot.userData.currentPoints = newBalance
                        this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'OTHER-PROMOTIONS',
                            `Completed activity | offerId=${offerId} | gainedPoints=${gainedPoints} | oldBalance=${oldBalance} | newBalance=${newBalance}`,
                            'green'
                        )
                    } else {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'OTHER-PROMOTIONS',
                            `Completed activity with no points | offerId=${offerId} | oldBalance=${oldBalance} | newBalance=${newBalance}`
                        )
                    }

                    // Update oldBalance for next iteration
                    oldBalance = newBalance

                    // Cooldown between requests
                    await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
                } catch (error) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'OTHER-PROMOTIONS',
                        `Error while solving activity | offerId=${activity.attributes.offerid} | message=${error instanceof Error ? error.message : String(error)}`
                    )
                }
            }

            this.bot.logger.info(
                this.bot.isMobile,
                'OTHER-PROMOTIONS',
                `All "Other Promotions" items have been completed | totalGainedPoints=${totalGainedPoints} | finalBalance=${this.bot.userData.currentPoints}`
            )
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'GET-OTHER-PROMOTION-DATA', 'API failed')
        }
    }

    public async doAppPromotions(data: AppDashboardData) {
        const appRewards = data.response.promotions.filter(x => {
            if (x.attributes['complete']?.toLowerCase() !== 'false') return false
            if (!x.attributes['offerid']) return false
            if (!x.attributes['type']) return false
            if (x.attributes['type'] !== 'sapphire') return false

            return true
        })

        if (!appRewards.length) {
            this.bot.logger.info(
                this.bot.isMobile,
                'APP-PROMOTIONS',
                'All "App Promotions" items have already been completed'
            )
            return
        }

        for (const reward of appRewards) {
            await this.bot.activities.doAppReward(reward)
            // A delay between completing each activity
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', 'All "App Promotions" items have been completed')
    }

    public async doSpecialPromotions(data: DashboardData) {
        const specialPromotions: PurplePromotionalItem[] = [
            ...new Map(
                [...(data.promotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as PurplePromotionalItem] as const)
            ).values()
        ]

        const supportedPromotions = ['ww_banner_optin_2x']

        const specialPromotionsUncompleted: PurplePromotionalItem[] =
            specialPromotions?.filter(x => {
                if (x.complete) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                const offerId = (x.offerId ?? '').toLowerCase()
                return supportedPromotions.some(s => offerId.includes(s))
            }) ?? []

        for (const activity of specialPromotionsUncompleted) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as PurplePromotionalItem).offerId

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type}"`
                )

                switch (type) {
                    // UrlReward
                    case 'urlreward': {
                        // Special "Double Search Points" activation
                        if (name.includes('ww_banner_optin_2x')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Double Search Points" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doDoubleSearchPoints(activity)
                        }
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'SPECIAL-ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SPECIAL-ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }

        this.bot.logger.info(this.bot.isMobile, 'SPECIAL-ACTIVITY', 'All "Special Activites" items have been completed')
    }

    public async doPunchCards(data: DashboardData, page: Page) {
        const punchCards =
            data.punchCards?.filter(
                x => !x.parentPromotion?.complete && (x.parentPromotion?.pointProgressMax ?? 0) > 0
            ) ?? []

        const punchCardActivities = punchCards.flatMap(x => x.childPromotions)

        const activitiesUncompleted: BasePromotion[] =
            punchCardActivities?.filter(x => {
                if (x.complete) return false
                if (x.exclusiveLockedFeatureStatus === 'locked') return false
                if (!x.promotionType) return false

                return true
            }) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have already been completed')
            return
        }

        this.bot.logger.info(
            this.bot.isMobile,
            'PUNCHCARD',
            `Started solving ${activitiesUncompleted.length} "Punch Card" items`
        )

        await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'PUNCHCARD', 'All "Punch Card" items have been completed')
    }

    private async solveActivities(activities: BasePromotion[], page: Page, punchCard?: PunchCard) {
        for (const activity of activities) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as BasePromotion).offerId
                const destinationUrl = activity.destinationUrl?.toLowerCase() ?? ''

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Processing activity | title="${activity.title}" | offerId=${offerId} | type=${type} | punchCard="${punchCard?.parentPromotion?.title ?? 'none'}"`
                )

                switch (type) {
                    // Quiz-like activities (Poll / regular quiz variants)
                    case 'quiz': {
                        const basePromotion = activity as BasePromotion

                        // Poll (usually 10 points, pollscenarioid in URL)
                        if (activity.pointProgressMax === 10 && destinationUrl.includes('pollscenarioid')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "Poll" | title="${activity.title}" | offerId=${offerId}`
                            )

                            //await this.bot.activities.doPoll(basePromotion)
                            break
                        }

                        // All other quizzes handled via Quiz API
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "Quiz" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doQuiz(basePromotion)
                        break
                    }

                    // UrlReward
                    case 'urlreward': {
                        const basePromotion = activity as BasePromotion

                        // Search on Bing are subtypes of "urlreward"
                        if (name.includes('exploreonbing')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "SearchOnBing" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doSearchOnBing(basePromotion, page)
                        } else {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `Found activity type "UrlReward" | title="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doUrlReward(basePromotion)
                        }
                        break
                    }

                    // Find Clippy specific promotion type
                    case 'findclippy': {
                        const clippyPromotion = activity as unknown as FindClippyPromotion

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Found activity type "FindClippy" | title="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doFindClippy(clippyPromotion)
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `Skipped activity "${activity.title}" | offerId=${offerId} | Reason: Unsupported type "${activity.promotionType}"`
                        )
                        break
                    }
                }

                // Cooldown
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `Error while solving activity "${activity.title}" | message=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }
}
